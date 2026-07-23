const std = @import("std");
const root = @import("llm_nutrition_api");
const vlm = root.vlm;
const http = @import("http.zig");
const tools = @import("tools.zig");

/// Ported verbatim (behavior-for-behavior) from the Rust original's
/// `run_agent_api` in `llm-nutrition-api/src/agent.rs` — the local
/// llama.cpp agent loop (`run_agent_local`) is dropped entirely per the
/// project-wide decision to only ever proxy to hosted LLM providers.
pub const MAX_ROUNDS: usize = 5;
pub const API_MAX_NEW_TOKENS: u32 = 8192;
pub const API_MAX_RETRIES: u32 = 8;

pub const SYSTEM_PROMPT =
    \\You are a nutrition expert. Look up or estimate nutritional values for the food the user describes.
    \\
    \\You have access to two tools. To call a tool, output ONLY a JSON object:
    \\  Search the web:  {"action": "search_web", "query": "your search query"}
    \\  Read a webpage:  {"action": "read_webpage", "url": "https://..."}
    \\
    \\RULES:
    \\- You MUST call search_web for any branded product (protein bars, cereals, snacks), packaged food, chain restaurant item, or fast food. Do not guess these from memory.
    \\- For unbranded whole foods (e.g. "1 egg", "100g chicken breast", "1 cup milk"), estimate directly — no tool call needed.
    \\- When a query says "cooked", "baked", "boiled", "grilled", or "prepared", always use post-cooking nutritional values, not raw/dry values. "1 cup cooked oatmeal" means cooked (water absorbed, ~166 kcal), not dry (~300 kcal).
    \\- Use the exact serving size stated in the query.
    \\
    \\EXAMPLES:
    \\
    \\User: CLIF BAR Chocolate Chip (68g)
    \\Assistant: {"action": "search_web", "query": "CLIF BAR Chocolate Chip 68g nutrition facts calories protein carbs fat"}
    \\User: Search results for 'CLIF BAR Chocolate Chip 68g nutrition facts calories protein carbs fat':
    \\Title: CLIF BAR Chocolate Chip Energy Bar Nutrition Facts
    \\Snippet: Serving size 1 bar (68g). Calories 250. Total Fat 6g. Protein 10g. Total Carbohydrate 44g.
    \\Assistant: {"description": "CLIF BAR Chocolate Chip", "calories": 250, "total_fat_grams": 6, "saturated_fat_grams": 1.5, "trans_fat_grams": 0, "polyunsaturated_fat_grams": 1.5, "monounsaturated_fat_grams": 2.5, "cholesterol_milligrams": 0, "sodium_milligrams": 150, "total_carbohydrate_grams": 44, "dietary_fiber_grams": 4, "total_sugars_grams": 17, "added_sugars_grams": 17, "protein_grams": 10}
    \\
    \\User: 1 cup cooked oatmeal (234g)
    \\Assistant: {"description": "1 cup cooked oatmeal", "calories": 166, "total_fat_grams": 3.6, "saturated_fat_grams": 0.7, "trans_fat_grams": 0, "polyunsaturated_fat_grams": 1.3, "monounsaturated_fat_grams": 1.1, "cholesterol_milligrams": 0, "sodium_milligrams": 115, "total_carbohydrate_grams": 28, "dietary_fiber_grams": 4, "total_sugars_grams": 0.6, "added_sugars_grams": 0, "protein_grams": 5.9}
    \\
    \\When you have enough information, output ONLY the final JSON (no markdown, no extra text):
    \\{"description": "...", "calories": 0, "total_fat_grams": 0, "saturated_fat_grams": 0, "trans_fat_grams": 0, "polyunsaturated_fat_grams": 0, "monounsaturated_fat_grams": 0, "cholesterol_milligrams": 0, "sodium_milligrams": 0, "total_carbohydrate_grams": 0, "dietary_fiber_grams": 0, "total_sugars_grams": 0, "added_sugars_grams": 0, "protein_grams": 0}
;

const FINAL_ROUND_NUDGE =
    "This is the final round: you must respond now with ONLY the complete JSON " ++
    "nutrition object (all 14 fields), giving your best estimate from whatever " ++
    "information you have so far. Do not call any more tools.";

const FINAL_JSON_NUDGE =
    "Output ONLY the JSON nutrition object. No markdown, no explanation, just the JSON object with all 14 fields.";

pub const AgentError = error{
    MaxRoundsExceeded,
    InvalidNutritionJson,
} || http.ChatError || tools.ToolError;

const ToolCall = struct {
    action: []const u8,
    query: []const u8 = "",
    url: []const u8 = "",
};

const Message = struct {
    role: []const u8,
    content: []const u8,
};

/// Runs the multi-round (max `MAX_ROUNDS`) tool-calling agent loop against
/// `description`, returning a fully populated `NutritionItem`.
///
/// `env.request_id`, if set by the caller, is threaded through to every log
/// line below and into `http.zig`'s/`tools.zig`'s own logging, purely for
/// correlating a request's log lines under concurrent load (each connection
/// is handled on its own thread -- see main.zig).
pub fn runAgent(env: root.Env, config: root.LlmConfig, description: []const u8) AgentError!root.NutritionItem {
    const rid: u64 = env.request_id orelse 0;

    var arena_state = std.heap.ArenaAllocator.init(env.allocator);
    defer arena_state.deinit();
    // A fresh scratch arena for this one request, reusing env's `.io` and
    // `.request_id`. Unlike auth.zig's validateJwt (flat, sequential
    // allocations -- freed individually, no arena needed), this genuinely
    // needs bulk-lifetime semantics: `conversation`'s entries from round 0
    // (the model's own tool-call output, tool results) must stay valid
    // through as many as 4 later rounds, since each round re-serializes the
    // *entire* conversation history. That's not a forgotten free -- it's a
    // batch of same-lifetime allocations whose lifetime is "however many
    // rounds this request takes," which isn't expressible as a handful of
    // sequential `defer`s.
    const req_env = root.Env{ .io = env.io, .allocator = arena_state.allocator(), .request_id = env.request_id };
    const arena = req_env.allocator;

    var conversation: std.ArrayList(Message) = .empty;
    try conversation.append(arena, .{ .role = "system", .content = SYSTEM_PROMPT });
    try conversation.append(arena, .{ .role = "user", .content = description });

    var round: usize = 0;
    while (round < MAX_ROUNDS) : (round += 1) {
        std.log.debug("[{d}] Agent round {d}", .{ rid, round });

        if (round + 1 == MAX_ROUNDS) {
            try conversation.append(arena, .{ .role = "user", .content = FINAL_ROUND_NUDGE });
        }

        const output = try callModel(req_env, config, conversation.items);
        std.log.debug("[{d}] Model output: {s}", .{ rid, output });

        const json_str = vlm.extractJson(output) orelse output;
        if (parseToolCall(arena, json_str)) |call| {
            if (std.mem.eql(u8, call.action, "search_web") and call.query.len > 0) {
                std.log.info("[{d}] Tool call: search_web({s})", .{ rid, call.query });
                const result = runSearchWeb(req_env, call.query);
                try conversation.append(arena, .{ .role = "assistant", .content = output });
                try conversation.append(arena, .{ .role = "user", .content = result });
                continue;
            }
            if (std.mem.eql(u8, call.action, "read_webpage") and call.url.len > 0) {
                std.log.info("[{d}] Tool call: read_webpage({s})", .{ rid, call.url });
                const result = runReadWebpage(req_env, call.url);
                try conversation.append(arena, .{ .role = "assistant", .content = output });
                try conversation.append(arena, .{ .role = "user", .content = result });
                continue;
            }
        }

        // No tool call — final pass requesting pure JSON.
        try conversation.append(arena, .{ .role = "assistant", .content = output });
        try conversation.append(arena, .{ .role = "user", .content = FINAL_JSON_NUDGE });

        const final_output = try callModel(req_env, config, conversation.items);
        std.log.debug("[{d}] Final JSON: {s}", .{ rid, final_output });

        const final_json = vlm.extractJson(final_output) orelse final_output;
        const item_parsed = std.json.parseFromSlice(root.NutritionItem, arena, final_json, .{ .ignore_unknown_fields = true }) catch |err| {
            std.log.err("[{d}] Failed to parse nutrition JSON ({s}):\n{s}", .{ rid, @errorName(err), final_output });
            return error.InvalidNutritionJson;
        };
        // The outer, longer-lived `env.allocator` -- NOT `req_env`/`arena`,
        // which is torn down when this function returns -- since
        // `description` must survive past that point.
        return dupeItem(env.allocator, item_parsed.value);
    }

    std.log.warn("[{d}] Max agent rounds ({d}) exceeded without a nutrition answer", .{ rid, MAX_ROUNDS });
    return error.MaxRoundsExceeded;
}

fn runSearchWeb(env: root.Env, query: []const u8) []const u8 {
    const rid: u64 = env.request_id orelse 0;
    const result = tools.searchWeb(env, query) catch |err| {
        std.log.warn("[{d}] search_web failed: {s}", .{ rid, @errorName(err) });
        return std.fmt.allocPrint(env.allocator, "Search failed: {s}. Estimate from nutritional knowledge instead.", .{@errorName(err)}) catch
            "Search failed. Estimate from nutritional knowledge instead.";
    };
    return std.fmt.allocPrint(env.allocator, "Search results for '{s}':\n{s}", .{ query, result }) catch result;
}

fn runReadWebpage(env: root.Env, url: []const u8) []const u8 {
    const rid: u64 = env.request_id orelse 0;
    const result = tools.readWebpage(env, url) catch |err| {
        std.log.warn("[{d}] read_webpage failed: {s}", .{ rid, @errorName(err) });
        return std.fmt.allocPrint(env.allocator, "Page fetch failed: {s}. Estimate from nutritional knowledge instead.", .{@errorName(err)}) catch
            "Page fetch failed. Estimate from nutritional knowledge instead.";
    };
    return std.fmt.allocPrint(env.allocator, "Page content from {s}:\n{s}", .{ url, result }) catch result;
}

fn parseToolCall(arena: std.mem.Allocator, json_str: []const u8) ?ToolCall {
    const parsed = std.json.parseFromSlice(ToolCall, arena, json_str, .{ .ignore_unknown_fields = true }) catch return null;
    return parsed.value;
}

fn callModel(env: root.Env, config: root.LlmConfig, conversation: []const Message) ![]const u8 {
    const body_json = try buildRequestBody(env.allocator, config.model, conversation);
    const text = try http.postChatCompletion(env, config.base_url, config.api_key, body_json, API_MAX_RETRIES);
    return http.extractContent(env.allocator, text);
}

fn buildRequestBody(arena: std.mem.Allocator, model: []const u8, conversation: []const Message) ![]u8 {
    var messages_arr = std.json.Array.init(arena);
    for (conversation) |m| {
        var message: std.json.ObjectMap = .empty;
        try message.put(arena, "role", .{ .string = m.role });
        try message.put(arena, "content", .{ .string = m.content });
        try messages_arr.append(.{ .object = message });
    }

    var body: std.json.ObjectMap = .empty;
    try body.put(arena, "model", .{ .string = model });
    try body.put(arena, "messages", .{ .array = messages_arr });
    try body.put(arena, "temperature", .{ .float = 0.1 });
    try body.put(arena, "max_tokens", .{ .integer = API_MAX_NEW_TOKENS });

    return std.json.Stringify.valueAlloc(arena, std.json.Value{ .object = body }, .{});
}

/// The parsed `NutritionItem`'s `description` string points into the
/// per-request arena (deinited when `runAgent` returns); duplicate it into
/// the caller's longer-lived allocator before handing the value back.
fn dupeItem(allocator: std.mem.Allocator, item: root.NutritionItem) !root.NutritionItem {
    var out = item;
    out.description = try allocator.dupe(u8, item.description);
    return out;
}

test "parseToolCall recognizes a well-formed tool call" {
    const allocator = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    const call = parseToolCall(arena.allocator(), "{\"action\": \"search_web\", \"query\": \"clif bar\"}").?;
    try std.testing.expectEqualStrings("search_web", call.action);
    try std.testing.expectEqualStrings("clif bar", call.query);
}

test "parseToolCall returns null for a final-answer JSON object with no action field" {
    const allocator = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    try std.testing.expectEqual(@as(?ToolCall, null), parseToolCall(arena.allocator(), "{\"description\": \"egg\", \"calories\": 70}"));
}

test "buildRequestBody includes all conversation turns" {
    const allocator = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    const conversation = [_]Message{
        .{ .role = "system", .content = "sys" },
        .{ .role = "user", .content = "hello" },
    };
    const body = try buildRequestBody(arena.allocator(), "test-model", &conversation);
    try std.testing.expect(std.mem.indexOf(u8, body, "\"test-model\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, body, "\"sys\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, body, "\"hello\"") != null);
}

const MockCtx = struct {
    net_server: *std.Io.net.Server,
    env: root.Env,
    response_bodies: []const []const u8,
    call_count: usize = 0,
};

/// Serves one canned chat-completion response per accepted connection, in
/// order, so `runAgent`'s multi-round loop can be exercised end-to-end
/// against a fake tool-call round followed by a final-answer round.
fn mockServerThread(ctx: *MockCtx) void {
    const io = ctx.env.io;
    const allocator = ctx.env.allocator;

    while (ctx.call_count < ctx.response_bodies.len) {
        const stream = ctx.net_server.accept(io) catch return;
        defer stream.close(io);

        var recv_buffer: [16 * 1024]u8 = undefined;
        var send_buffer: [16 * 1024]u8 = undefined;
        var stream_reader = stream.reader(io, &recv_buffer);
        var stream_writer = stream.writer(io, &send_buffer);
        var server = std.http.Server.init(&stream_reader.interface, &stream_writer.interface);

        var request = server.receiveHead() catch return;
        var body_read_buf: [16 * 1024]u8 = undefined;
        const body_reader = request.readerExpectContinue(&body_read_buf) catch return;
        _ = body_reader.allocRemaining(allocator, .limited(10 * 1024 * 1024)) catch return;

        const body = ctx.response_bodies[ctx.call_count];
        ctx.call_count += 1;

        request.respond(body, .{
            .keep_alive = false,
            .extra_headers = &.{.{ .name = "content-type", .value = "application/json" }},
        }) catch return;
    }
}

fn chatResponseBody(arena: std.mem.Allocator, content: []const u8) ![]const u8 {
    const content_json = try std.json.Stringify.valueAlloc(arena, content, .{});
    return std.fmt.allocPrint(arena,
        \\{{"choices": [{{"message": {{"role": "assistant", "content": {s}}}}}]}}
    , .{content_json});
}

test "runAgent takes a focused final pass when the first round isn't a tool call" {
    const env = root.Env{ .io = std.testing.io, .allocator = std.testing.allocator, .request_id = 1 };

    // Deliberately avoids exercising the search_web/read_webpage tool-call
    // branches here, since those make real network calls — covered instead
    // by tools.zig's own parsing unit tests (synthetic and real captured
    // HTML, no network) and by running the Python eval harness against the
    // real service end-to-end (see eval/run_evals.py).
    var addr = try std.Io.net.IpAddress.parse("127.0.0.1", 47882);
    var net_server = try addr.listen(env.io, .{ .reuse_address = true });
    defer net_server.deinit(env.io);

    var arena = std.heap.ArenaAllocator.init(env.allocator);
    defer arena.deinit();
    const arena_alloc = arena.allocator();

    const chatty_response = try chatResponseBody(arena_alloc, "Sure, roughly 70 calories for one large egg.");
    const final_response = try chatResponseBody(arena_alloc,
        \\{"description": "1 large egg", "calories": 70, "total_fat_grams": 5, "saturated_fat_grams": 1.6, "trans_fat_grams": 0, "polyunsaturated_fat_grams": 0.7, "monounsaturated_fat_grams": 2, "cholesterol_milligrams": 186, "sodium_milligrams": 70, "total_carbohydrate_grams": 0.4, "dietary_fiber_grams": 0, "total_sugars_grams": 0.2, "added_sugars_grams": 0, "protein_grams": 6}
    );

    var ctx = MockCtx{
        .net_server = &net_server,
        .env = .{ .io = env.io, .allocator = arena_alloc },
        .response_bodies = &.{ chatty_response, final_response },
    };

    const thread = try std.Thread.spawn(.{}, mockServerThread, .{&ctx});

    const config = root.LlmConfig{ .api_key = "test-key", .model = "test-model", .base_url = "http://127.0.0.1:47882" };
    const item = try runAgent(env, config, "1 large egg");
    defer env.allocator.free(item.description);

    thread.join();

    try std.testing.expectEqualStrings("1 large egg", item.description);
    try std.testing.expectEqual(@as(f64, 70), item.calories);
    try std.testing.expectEqual(@as(f64, 6), item.protein_grams);
}
