const std = @import("std");
const root = @import("llm_nutrition_api");
const vlm = root.vlm;
const http = @import("llm/http.zig");

const MAX_TOKENS: u32 = 512;
const MAX_RETRIES: u32 = 8;

pub const InferError = error{
    InvalidVlmJson,
} || http.ChatError;

/// Parses a nutrition label image via an OpenRouter/OpenAI-compatible
/// vision-capable chat-completions endpoint.
pub fn infer(config: root.LlmConfig, env: root.Env, image_bytes: []const u8) InferError!root.ParsedNutritionFacts {
    var arena_state = std.heap.ArenaAllocator.init(env.allocator);
    defer arena_state.deinit();
    // A fresh scratch arena for this one inference call, reusing env's
    // `.io` -- request-building here constructs a nested `std.json.Value`
    // tree (see buildRequestBody), which is impractical to free field by
    // field, so this is a case where a scoped arena is the right tool
    // (not a workaround). ParsedNutritionFacts holds only plain numeric
    // fields, so nothing needs to survive past this arena being torn down.
    const req_env = root.Env{ .io = env.io, .allocator = arena_state.allocator(), .request_id = env.request_id };
    const arena = req_env.allocator;

    const b64_len = std.base64.standard.Encoder.calcSize(image_bytes.len);
    const b64 = try arena.alloc(u8, b64_len);
    _ = std.base64.standard.Encoder.encode(b64, image_bytes);
    const data_url = try std.fmt.allocPrint(arena, "data:image/jpeg;base64,{s}", .{b64});

    const body_json = try buildRequestBody(arena, config.model, data_url);
    const text = try http.postChatCompletion(req_env, config.base_url, config.api_key, body_json, MAX_RETRIES);
    return parseInferenceResponse(arena, text);
}

fn buildRequestBody(arena: std.mem.Allocator, model: []const u8, data_url: []const u8) ![]u8 {
    var image_obj: std.json.ObjectMap = .empty;
    try image_obj.put(arena, "url", .{ .string = data_url });

    var image_part: std.json.ObjectMap = .empty;
    try image_part.put(arena, "type", .{ .string = "image_url" });
    try image_part.put(arena, "image_url", .{ .object = image_obj });

    var text_part: std.json.ObjectMap = .empty;
    try text_part.put(arena, "type", .{ .string = "text" });
    try text_part.put(arena, "text", .{ .string = vlm.NUTRITION_PROMPT });

    var content_arr = std.json.Array.init(arena);
    try content_arr.append(.{ .object = image_part });
    try content_arr.append(.{ .object = text_part });

    var message: std.json.ObjectMap = .empty;
    try message.put(arena, "role", .{ .string = "user" });
    try message.put(arena, "content", .{ .array = content_arr });

    var messages_arr = std.json.Array.init(arena);
    try messages_arr.append(.{ .object = message });

    var body: std.json.ObjectMap = .empty;
    try body.put(arena, "model", .{ .string = model });
    try body.put(arena, "messages", .{ .array = messages_arr });
    try body.put(arena, "temperature", .{ .float = 0.1 });
    try body.put(arena, "max_tokens", .{ .integer = MAX_TOKENS });

    return std.json.Stringify.valueAlloc(arena, std.json.Value{ .object = body }, .{});
}

/// Parses `choices[0].message.content` out of an OpenAI-compatible chat
/// completions response, then extracts and parses the JSON nutrition facts
/// object it contains.
fn parseInferenceResponse(arena: std.mem.Allocator, text: []const u8) !root.ParsedNutritionFacts {
    const content = try http.extractContent(arena, text);

    const json_str = vlm.extractJson(content) orelse content;
    const facts_parsed = std.json.parseFromSlice(root.ParsedNutritionFacts, arena, json_str, .{ .ignore_unknown_fields = true }) catch |err| {
        std.log.err("Failed to parse VLM JSON output ({s}):\n{s}", .{ @errorName(err), content });
        return error.InvalidVlmJson;
    };
    return facts_parsed.value;
}

test "parseInferenceResponse extracts nutrition facts from chat completion content" {
    const allocator = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();

    const body =
        \\{"choices": [{"message": {"role": "assistant", "content": "Sure!\n{\"calories\": 110, \"protein_g\": 3.0}\nThanks"}}]}
    ;
    const facts = try parseInferenceResponse(arena.allocator(), body);
    try std.testing.expectEqual(@as(?i32, 110), facts.calories);
    try std.testing.expectEqual(@as(?f64, 3.0), facts.protein_g);
    try std.testing.expectEqual(@as(?f64, null), facts.sodium_mg);
}

const MockCtx = struct {
    net_server: *std.Io.net.Server,
    env: root.Env,
    validation_error: ?[]const u8 = null,
    response_body: []const u8,
};

/// Minimal HTTP/1.1 mock server: accepts one connection, validates the
/// OpenAI-style vision message shape, and replies with a canned response
/// body — mirroring the Rust original's `spawn_mock` test helper.
fn mockServerThread(ctx: *MockCtx) void {
    const io = ctx.env.io;
    const allocator = ctx.env.allocator;

    const stream = ctx.net_server.accept(io) catch |err| {
        ctx.validation_error = std.fmt.allocPrint(allocator, "accept failed: {s}", .{@errorName(err)}) catch "accept failed";
        return;
    };
    defer stream.close(io);

    var recv_buffer: [16 * 1024]u8 = undefined;
    var send_buffer: [16 * 1024]u8 = undefined;
    var stream_reader = stream.reader(io, &recv_buffer);
    var stream_writer = stream.writer(io, &send_buffer);
    var server = std.http.Server.init(&stream_reader.interface, &stream_writer.interface);

    var request = server.receiveHead() catch |err| {
        ctx.validation_error = std.fmt.allocPrint(allocator, "receiveHead failed: {s}", .{@errorName(err)}) catch "receiveHead failed";
        return;
    };

    var body_read_buf: [16 * 1024]u8 = undefined;
    const body_reader = request.readerExpectContinue(&body_read_buf) catch |err| {
        ctx.validation_error = std.fmt.allocPrint(allocator, "reader failed: {s}", .{@errorName(err)}) catch "reader failed";
        return;
    };
    const body = body_reader.allocRemaining(allocator, .limited(10 * 1024 * 1024)) catch |err| {
        ctx.validation_error = std.fmt.allocPrint(allocator, "read body failed: {s}", .{@errorName(err)}) catch "read body failed";
        return;
    };

    ctx.validation_error = validateRequestShape(allocator, body);

    request.respond(ctx.response_body, .{
        .keep_alive = false,
        .extra_headers = &.{.{ .name = "content-type", .value = "application/json" }},
    }) catch |err| {
        ctx.validation_error = std.fmt.allocPrint(allocator, "respond failed: {s}", .{@errorName(err)}) catch "respond failed";
    };
}

fn validateRequestShape(allocator: std.mem.Allocator, body: []const u8) ?[]const u8 {
    var parsed = std.json.parseFromSlice(std.json.Value, allocator, body, .{}) catch |err|
        return std.fmt.allocPrint(allocator, "body not valid json: {s}", .{@errorName(err)}) catch "body not valid json";
    const content = (parsed.value.object.get("messages") orelse return "missing messages").array.items[0].object.get("content") orelse return "missing content";
    if (content != .array) return "content is not an array";

    var has_image = false;
    var has_text = false;
    for (content.array.items) |part| {
        if (part != .object) continue;
        const type_val = part.object.get("type") orelse continue;
        if (type_val != .string) continue;
        if (std.mem.eql(u8, type_val.string, "image_url")) {
            has_image = true;
            const image_url = (part.object.get("image_url") orelse continue);
            if (image_url != .object) continue;
            const url = (image_url.object.get("url") orelse continue);
            if (url != .string or !std.mem.startsWith(u8, url.string, "data:image/")) {
                return "image_url is not a data URL";
            }
        } else if (std.mem.eql(u8, type_val.string, "text")) {
            has_text = true;
        }
    }
    if (!has_image) return "missing image_url part";
    if (!has_text) return "missing text part";
    return null;
}

test "infer performs a real HTTP round trip against a mock OpenAI-compatible server" {
    const env = root.Env{ .io = std.testing.io, .allocator = std.testing.allocator };

    // 0.16's Io.net.Server doesn't expose the bound socket's local address
    // (no getsockname-style accessor), so an ephemeral port (port 0) can't
    // be resolved back after listen(); use a fixed test-only port instead.
    var addr = try std.Io.net.IpAddress.parse("127.0.0.1", 47881);
    var net_server = try addr.listen(env.io, .{ .reuse_address = true });
    defer net_server.deinit(env.io);

    const expected = root.ParsedNutritionFacts{ .calories = 100, .protein_g = 5.0 };

    var arena = std.heap.ArenaAllocator.init(env.allocator);
    defer arena.deinit();
    const arena_alloc = arena.allocator();

    const facts_json = try std.json.Stringify.valueAlloc(arena_alloc, expected, .{});
    const content_json = try std.json.Stringify.valueAlloc(arena_alloc, facts_json, .{});

    const response_body = try std.fmt.allocPrint(arena_alloc,
        \\{{"choices": [{{"message": {{"role": "assistant", "content": {s}}}}}]}}
    , .{content_json});

    var ctx = MockCtx{
        .net_server = &net_server,
        .env = .{ .io = env.io, .allocator = arena_alloc },
        .response_body = response_body,
    };

    const thread = try std.Thread.spawn(.{}, mockServerThread, .{&ctx});

    const config = root.LlmConfig{ .api_key = "test-key", .model = "test-model", .base_url = "http://127.0.0.1:47881" };
    const actual = try infer(config, env, "fake-image-bytes");

    thread.join();

    if (ctx.validation_error) |e| {
        std.debug.print("mock server validation error: {s}\n", .{e});
        return error.MockValidationFailed;
    }
    try std.testing.expect(actual.eql(expected));
}
