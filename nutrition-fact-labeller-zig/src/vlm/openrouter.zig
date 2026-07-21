const std = @import("std");
const root = @import("nutrition_fact_labeller");
const vlm = root.vlm;

const MAX_TOKENS: u32 = 512;
const MAX_RETRIES: u32 = 8;

/// Operational default: Gemma-4-31B via OpenRouter scored 100% all-fields /
/// 33/33 whole-record on the full 33-image eval (see the Rust original's
/// eval-results/README.md), a wide margin over every self-hosted candidate.
/// Override with LLM_MODEL/OPENROUTER_MODEL if a different model is needed.
pub const DEFAULT_MODEL = "google/gemma-4-31b-it:free";

/// Paired with DEFAULT_MODEL above — this must stay OpenRouter's endpoint,
/// not Gemini's, since DEFAULT_MODEL is an OpenRouter-specific model slug.
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

pub const LlmApiBackend = struct {
    api_key: []const u8,
    model: []const u8,
    base_url: []const u8,

    /// Reads LLM_BASE_URL/OPENROUTER_BASE_URL from the environment, falling
    /// back to DEFAULT_BASE_URL. Caller retains ownership of `api_key`/`model`.
    pub fn init(allocator: std.mem.Allocator, api_key: []const u8, model: []const u8) !LlmApiBackend {
        const base_url = std.process.getEnvVarOwned(allocator, "LLM_BASE_URL") catch
            (std.process.getEnvVarOwned(allocator, "OPENROUTER_BASE_URL") catch
                try allocator.dupe(u8, DEFAULT_BASE_URL));
        return .{ .api_key = api_key, .model = model, .base_url = base_url };
    }

    pub fn withBaseUrl(api_key: []const u8, model: []const u8, base_url: []const u8) LlmApiBackend {
        return .{ .api_key = api_key, .model = model, .base_url = base_url };
    }

    pub fn name(self: *const LlmApiBackend) []const u8 {
        return self.model;
    }

    pub const InferError = error{
        LlmApiRequestFailed,
        RateLimitExceeded,
        LlmApiError,
        MissingContent,
        InvalidVlmJson,
    } || std.mem.Allocator.Error;

    pub fn infer(self: *const LlmApiBackend, allocator: std.mem.Allocator, image_bytes: []const u8) !root.ParsedNutritionFacts {
        var arena_state = std.heap.ArenaAllocator.init(allocator);
        defer arena_state.deinit();
        const arena = arena_state.allocator();

        const b64_len = std.base64.standard.Encoder.calcSize(image_bytes.len);
        const b64 = try arena.alloc(u8, b64_len);
        _ = std.base64.standard.Encoder.encode(b64, image_bytes);
        const data_url = try std.fmt.allocPrint(arena, "data:image/jpeg;base64,{s}", .{b64});

        const body_json = try buildRequestBody(arena, self.model, data_url);

        const endpoint = try std.fmt.allocPrint(arena, "{s}/chat/completions", .{self.base_url});
        const uri = std.Uri.parse(endpoint) catch return error.LlmApiRequestFailed;
        const auth_header = try std.fmt.allocPrint(arena, "Bearer {s}", .{self.api_key});

        var client = std.http.Client{ .allocator = arena };
        defer client.deinit();

        var attempt: u32 = 0;
        while (true) {
            var server_header_buffer: [16 * 1024]u8 = undefined;
            var req = client.open(.POST, uri, .{
                .server_header_buffer = &server_header_buffer,
                .headers = .{
                    .content_type = .{ .override = "application/json" },
                    .authorization = .{ .override = auth_header },
                },
            }) catch return error.LlmApiRequestFailed;
            defer req.deinit();

            req.transfer_encoding = .{ .content_length = body_json.len };
            req.send() catch return error.LlmApiRequestFailed;
            req.writeAll(body_json) catch return error.LlmApiRequestFailed;
            req.finish() catch return error.LlmApiRequestFailed;
            req.wait() catch return error.LlmApiRequestFailed;

            if (req.response.status == .too_many_requests) {
                if (attempt >= MAX_RETRIES) return error.RateLimitExceeded;

                var retry_after_secs: ?u64 = null;
                var it = req.response.iterateHeaders();
                while (it.next()) |h| {
                    if (std.ascii.eqlIgnoreCase(h.name, "retry-after")) {
                        retry_after_secs = std.fmt.parseInt(u64, h.value, 10) catch null;
                    }
                }

                const text = req.reader().readAllAlloc(arena, 1 << 20) catch "";
                const body_secs = parseRetryDelaySeconds(text);
                const delay_secs = retry_after_secs orelse body_secs orelse (@as(u64, 1) << @intCast(@min(attempt, 32)));
                std.log.warn("LLM API 429, retrying in {d}s", .{delay_secs});
                std.time.sleep(delay_secs * std.time.ns_per_s);
                attempt += 1;
                continue;
            }

            if (req.response.status.class() != .success) {
                const text = req.reader().readAllAlloc(arena, 1 << 20) catch "";
                std.log.err("LLM API error {d}: {s}", .{ @intFromEnum(req.response.status), text });
                return error.LlmApiError;
            }

            const text = req.reader().readAllAlloc(arena, 8 << 20) catch return error.LlmApiRequestFailed;
            return parseInferenceResponse(allocator, arena, text);
        }
    }
};

fn buildRequestBody(arena: std.mem.Allocator, model: []const u8, data_url: []const u8) ![]const u8 {
    var image_obj = std.json.ObjectMap.init(arena);
    try image_obj.put("url", .{ .string = data_url });

    var image_part = std.json.ObjectMap.init(arena);
    try image_part.put("type", .{ .string = "image_url" });
    try image_part.put("image_url", .{ .object = image_obj });

    var text_part = std.json.ObjectMap.init(arena);
    try text_part.put("type", .{ .string = "text" });
    try text_part.put("text", .{ .string = vlm.NUTRITION_PROMPT });

    var content_arr = std.json.Array.init(arena);
    try content_arr.append(.{ .object = image_part });
    try content_arr.append(.{ .object = text_part });

    var message = std.json.ObjectMap.init(arena);
    try message.put("role", .{ .string = "user" });
    try message.put("content", .{ .array = content_arr });

    var messages_arr = std.json.Array.init(arena);
    try messages_arr.append(.{ .object = message });

    var body = std.json.ObjectMap.init(arena);
    try body.put("model", .{ .string = model });
    try body.put("messages", .{ .array = messages_arr });
    try body.put("temperature", .{ .float = 0.1 });
    try body.put("max_tokens", .{ .integer = MAX_TOKENS });

    var buf = std.ArrayList(u8).init(arena);
    try std.json.stringify(std.json.Value{ .object = body }, .{}, buf.writer());
    return buf.items;
}

/// Parses `error.details[].retryDelay` (e.g. "1.5s") from a Gemini-style error
/// body, mirroring the Rust original's fallback for OpenRouter's 429 payload.
fn parseRetryDelaySeconds(text: []const u8) ?u64 {
    var scratch = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer scratch.deinit();
    const parsed = std.json.parseFromSlice(std.json.Value, scratch.allocator(), text, .{}) catch return null;
    const err_obj = (parsed.value.object.get("error") orelse return null).object;
    const details = (err_obj.get("details") orelse return null).array;
    for (details.items) |detail| {
        if (detail != .object) continue;
        const retry_delay = detail.object.get("retryDelay") orelse continue;
        if (retry_delay != .string) continue;
        const trimmed = std.mem.trimRight(u8, retry_delay.string, "s");
        return std.fmt.parseInt(u64, trimmed, 10) catch continue;
    }
    return null;
}

/// Parses `choices[0].message.content` out of an OpenAI-compatible chat
/// completions response, then extracts and parses the JSON nutrition facts
/// object it contains. `result_allocator` backs the returned value (which
/// holds no allocations today, but keeping the split mirrors the Rust
/// original's error-context pattern and leaves room for future string fields).
fn parseInferenceResponse(result_allocator: std.mem.Allocator, arena: std.mem.Allocator, text: []const u8) !root.ParsedNutritionFacts {
    _ = result_allocator;
    var parsed = std.json.parseFromSlice(std.json.Value, arena, text, .{}) catch return error.MissingContent;
    const choices = (parsed.value.object.get("choices") orelse return error.MissingContent);
    if (choices != .array or choices.array.items.len == 0) return error.MissingContent;
    const message = (choices.array.items[0].object.get("message") orelse return error.MissingContent);
    const content_val = (message.object.get("content") orelse return error.MissingContent);
    if (content_val != .string) return error.MissingContent;
    const content = std.mem.trim(u8, content_val.string, " \t\r\n");

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
    const facts = try parseInferenceResponse(allocator, arena.allocator(), body);
    try std.testing.expectEqual(@as(?i32, 110), facts.calories);
    try std.testing.expectEqual(@as(?f64, 3.0), facts.protein_g);
    try std.testing.expectEqual(@as(?f64, null), facts.sodium_mg);
}

test "parseRetryDelaySeconds reads Gemini-style retryDelay" {
    const body =
        \\{"error": {"details": [{"retryDelay": "3s"}]}}
    ;
    try std.testing.expectEqual(@as(?u64, 3), parseRetryDelaySeconds(body));
}

test "parseRetryDelaySeconds returns null when absent" {
    try std.testing.expectEqual(@as(?u64, null), parseRetryDelaySeconds("{}"));
}

const MockCtx = struct {
    net_server: *std.net.Server,
    allocator: std.mem.Allocator,
    validation_error: ?[]const u8 = null,
    response_body: []const u8,
};

/// Minimal HTTP/1.1 mock server: accepts one connection, validates the
/// OpenAI-style vision message shape, and replies with a canned response
/// body — mirroring the Rust original's `spawn_mock` test helper.
fn mockServerThread(ctx: *MockCtx) void {
    const connection = ctx.net_server.accept() catch |err| {
        ctx.validation_error = std.fmt.allocPrint(ctx.allocator, "accept failed: {s}", .{@errorName(err)}) catch "accept failed";
        return;
    };
    defer connection.stream.close();

    var read_buffer: [16 * 1024]u8 = undefined;
    var server = std.http.Server.init(connection, &read_buffer);
    var request = server.receiveHead() catch |err| {
        ctx.validation_error = std.fmt.allocPrint(ctx.allocator, "receiveHead failed: {s}", .{@errorName(err)}) catch "receiveHead failed";
        return;
    };

    const body_reader = request.reader() catch |err| {
        ctx.validation_error = std.fmt.allocPrint(ctx.allocator, "reader failed: {s}", .{@errorName(err)}) catch "reader failed";
        return;
    };
    const body = body_reader.readAllAlloc(ctx.allocator, 10 * 1024 * 1024) catch |err| {
        ctx.validation_error = std.fmt.allocPrint(ctx.allocator, "read body failed: {s}", .{@errorName(err)}) catch "read body failed";
        return;
    };

    ctx.validation_error = validateRequestShape(ctx.allocator, body);

    request.respond(ctx.response_body, .{
        .keep_alive = false,
        .extra_headers = &.{.{ .name = "content-type", .value = "application/json" }},
    }) catch |err| {
        ctx.validation_error = std.fmt.allocPrint(ctx.allocator, "respond failed: {s}", .{@errorName(err)}) catch "respond failed";
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
    const allocator = std.testing.allocator;

    const address = try std.net.Address.parseIp("127.0.0.1", 0);
    var net_server = try address.listen(.{});
    defer net_server.deinit();
    const port = net_server.listen_address.getPort();

    const expected = root.ParsedNutritionFacts{ .calories = 100, .protein_g = 5.0 };

    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    const arena_alloc = arena.allocator();

    var facts_json = std.ArrayList(u8).init(arena_alloc);
    try std.json.stringify(expected, .{}, facts_json.writer());

    var content_json = std.ArrayList(u8).init(arena_alloc);
    try std.json.stringify(facts_json.items, .{}, content_json.writer());

    const response_body = try std.fmt.allocPrint(arena_alloc,
        \\{{"choices": [{{"message": {{"role": "assistant", "content": {s}}}}}]}}
    , .{content_json.items});

    var ctx = MockCtx{
        .net_server = &net_server,
        .allocator = arena_alloc,
        .response_body = response_body,
    };

    const thread = try std.Thread.spawn(.{}, mockServerThread, .{&ctx});

    const base_url = try std.fmt.allocPrint(arena_alloc, "http://127.0.0.1:{d}", .{port});
    const backend = LlmApiBackend.withBaseUrl("test-key", "test-model", base_url);
    const actual = try backend.infer(allocator, "fake-image-bytes");

    thread.join();

    if (ctx.validation_error) |e| {
        std.debug.print("mock server validation error: {s}\n", .{e});
        return error.MockValidationFailed;
    }
    try std.testing.expect(actual.eql(expected));
}
