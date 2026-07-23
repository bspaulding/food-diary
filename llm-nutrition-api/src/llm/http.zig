const std = @import("std");
const root = @import("llm_nutrition_api");

/// Shared OpenAI-compatible chat-completions POST + retry logic, used by
/// both the vision backend (`openrouter.zig`, single-shot image+text
/// calls) and the text-lookup agent (`llm/agent.zig`, multi-turn
/// conversations) — the request/retry mechanics are identical, only the
/// request body shape and response handling differ.
pub const ChatError = error{
    RequestFailed,
    RateLimitExceeded,
    ApiError,
    MissingContent,
} || std.mem.Allocator.Error;

/// POSTs `body_json` to `{base_url}/chat/completions` with the given API
/// key, retrying on 429 (`Retry-After` header, then a Gemini-style
/// `error.details[].retryDelay` body field, then exponential backoff) up to
/// `max_retries` attempts. Returns the raw response body text on success
/// (2xx), allocated from `env.allocator`.
pub fn postChatCompletion(
    env: root.Env,
    base_url: []const u8,
    api_key: []const u8,
    body_json: []u8,
    max_retries: u32,
) ChatError![]const u8 {
    const allocator = env.allocator;
    const endpoint = try std.fmt.allocPrint(allocator, "{s}/chat/completions", .{base_url});
    const uri = std.Uri.parse(endpoint) catch return error.RequestFailed;
    const auth_header = try std.fmt.allocPrint(allocator, "Bearer {s}", .{api_key});

    var client = std.http.Client{ .allocator = allocator, .io = env.io };
    defer client.deinit();

    // Real request ids start at 1 (see main.zig), so 0 unambiguously means
    // "no request context" (a direct/benchmark/test call) without needing
    // to branch the format string at every log site below.
    const rid: u64 = env.request_id orelse 0;

    var attempt: u32 = 0;
    while (true) {
        var req = client.request(.POST, uri, .{
            .headers = .{
                .content_type = .{ .override = "application/json" },
                .authorization = .{ .override = auth_header },
            },
        }) catch return error.RequestFailed;
        defer req.deinit();

        req.sendBodyComplete(body_json) catch return error.RequestFailed;

        var redirect_buf: [4096]u8 = undefined;
        var response = req.receiveHead(&redirect_buf) catch return error.RequestFailed;

        if (response.head.status == .too_many_requests) {
            if (attempt >= max_retries) return error.RateLimitExceeded;

            var retry_after_secs: ?u64 = null;
            var it = response.head.iterateHeaders();
            while (it.next()) |h| {
                if (std.ascii.eqlIgnoreCase(h.name, "retry-after")) {
                    retry_after_secs = std.fmt.parseInt(u64, h.value, 10) catch null;
                }
            }

            const text = readBody(&response, allocator, 1 << 20) catch "";
            const body_secs = parseRetryDelaySeconds(text);
            const delay_secs = retry_after_secs orelse body_secs orelse (@as(u64, 1) << @intCast(@min(attempt, 32)));
            std.log.warn("[{d}] LLM API 429, retrying in {d}s", .{ rid, delay_secs });
            std.Io.sleep(env.io, .fromSeconds(@intCast(delay_secs)), .awake) catch {};
            attempt += 1;
            continue;
        }

        if (response.head.status.class() != .success) {
            const text = readBody(&response, allocator, 1 << 20) catch "";
            std.log.err("[{d}] LLM API error {d}: {s}", .{ rid, @intFromEnum(response.head.status), text });
            return error.ApiError;
        }

        return readBody(&response, allocator, 8 << 20) catch return error.RequestFailed;
    }
}

/// Reads a response body, transparently decompressing it if the server sent
/// `Content-Encoding: gzip`/`deflate` (`std.http.Client` negotiates these by
/// default but `Response.reader` alone returns the *compressed* bytes --
/// real providers like OpenRouter/Gemini do compress responses, unlike the
/// plain-text mock servers this project's tests use, so this was a real bug
/// caught only by testing against a live API rather than a mock).
fn readBody(response: *std.http.Client.Response, arena: std.mem.Allocator, max_bytes: usize) ![]const u8 {
    var transfer_buf: [8192]u8 = undefined;
    const decompress_buffer: []u8 = switch (response.head.content_encoding) {
        .identity => &.{},
        .deflate, .gzip => try arena.alloc(u8, std.compress.flate.max_window_len),
        .zstd, .compress => return error.RequestFailed, // not advertised in Accept-Encoding; shouldn't happen
    };
    var decompress: std.http.Decompress = undefined;
    const reader = response.readerDecompressing(&transfer_buf, &decompress, decompress_buffer);
    return reader.allocRemaining(arena, .limited(max_bytes));
}

/// Parses `error.details[].retryDelay` (e.g. "1.5s") from a Gemini-style
/// error body, used as a 429-retry-delay fallback when no `Retry-After`
/// header is present.
pub fn parseRetryDelaySeconds(text: []const u8) ?u64 {
    var scratch = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer scratch.deinit();
    const parsed = std.json.parseFromSlice(std.json.Value, scratch.allocator(), text, .{}) catch return null;
    const err_obj = (parsed.value.object.get("error") orelse return null).object;
    const details = (err_obj.get("details") orelse return null).array;
    for (details.items) |detail| {
        if (detail != .object) continue;
        const retry_delay = detail.object.get("retryDelay") orelse continue;
        if (retry_delay != .string) continue;
        const trimmed = std.mem.trimEnd(u8, retry_delay.string, "s");
        return std.fmt.parseInt(u64, trimmed, 10) catch continue;
    }
    return null;
}

/// Extracts `choices[0].message.content` (trimmed) from an OpenAI-compatible
/// chat-completions JSON response.
pub fn extractContent(arena: std.mem.Allocator, response_text: []const u8) ChatError![]const u8 {
    const parsed = std.json.parseFromSlice(std.json.Value, arena, response_text, .{}) catch return error.MissingContent;
    const choices = (parsed.value.object.get("choices") orelse return error.MissingContent);
    if (choices != .array or choices.array.items.len == 0) return error.MissingContent;
    const message = (choices.array.items[0].object.get("message") orelse return error.MissingContent);
    const content_val = (message.object.get("content") orelse return error.MissingContent);
    if (content_val != .string) return error.MissingContent;
    return std.mem.trim(u8, content_val.string, " \t\r\n");
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

test "extractContent parses chat completion content" {
    const allocator = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();

    const body =
        \\{"choices": [{"message": {"role": "assistant", "content": "  hello world  "}}]}
    ;
    const content = try extractContent(arena.allocator(), body);
    try std.testing.expectEqualStrings("hello world", content);
}

test "extractContent returns MissingContent when choices absent" {
    const allocator = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    try std.testing.expectError(error.MissingContent, extractContent(arena.allocator(), "{}"));
}
