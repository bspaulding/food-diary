const std = @import("std");
const root = @import("nutrition_fact_labeller");
const auth = @import("auth.zig");
const openrouter = @import("vlm/openrouter.zig");
const net = std.Io.net;

const MAX_BODY_BYTES: usize = 50 * 1024 * 1024;

// std.log's level filtering (the `logEnabled` check in std/log.zig) happens
// at comptime against `std_options.log_level`, so it can't be changed at
// runtime by itself -- and its *default* value is build-mode dependent
// (`.err` in ReleaseFast/ReleaseSmall, which would silently drop the
// startup/backend-selection `info` logs and per-request JWT-failure `warn`
// logs below). To get a runtime-configurable LOG_LEVEL, set the comptime
// level to `.debug` (compiling every call site in) and do the actual
// filtering ourselves in a custom logFn against `runtime_log_level`.
var runtime_log_level: std.log.Level = .info;

pub const std_options: std.Options = .{
    .log_level = .debug,
    .logFn = logFn,
};

fn logFn(
    comptime message_level: std.log.Level,
    comptime scope: @EnumLiteral(),
    comptime format: []const u8,
    args: anytype,
) void {
    if (@intFromEnum(message_level) > @intFromEnum(runtime_log_level)) return;

    const level_txt = comptime message_level.asText();
    const prefix = if (scope == .default) ": " else "(" ++ @tagName(scope) ++ "): ";

    var buf: [1024]u8 = undefined;
    const locked = std.debug.lockStderr(&buf);
    defer std.debug.unlockStderr();
    locked.file_writer.interface.print(level_txt ++ prefix ++ format ++ "\n", args) catch return;
}

/// Parses LOG_LEVEL values "debug"/"info"/"warn"/"warning"/"error"/"err"
/// (case-insensitive). Returns null for unset or unrecognized values.
fn parseLogLevel(s: []const u8) ?std.log.Level {
    if (std.ascii.eqlIgnoreCase(s, "debug")) return .debug;
    if (std.ascii.eqlIgnoreCase(s, "info")) return .info;
    if (std.ascii.eqlIgnoreCase(s, "warn") or std.ascii.eqlIgnoreCase(s, "warning")) return .warn;
    if (std.ascii.eqlIgnoreCase(s, "error") or std.ascii.eqlIgnoreCase(s, "err")) return .err;
    return null;
}

/// Tries each env var name in order, returning the first one that's set.
/// Borrowed from `environ`, valid for the process's lifetime.
fn getEnvAny(environ: *const std.process.Environ.Map, names: []const []const u8) ?[]const u8 {
    for (names) |name| {
        if (environ.get(name)) |v| return v;
    }
    return null;
}

const ConnCtx = struct {
    io: std.Io,
    environ: *const std.process.Environ.Map,
    backend: ?openrouter.LlmApiBackend,
};

pub fn main(init: std.process.Init) !void {
    const io = init.io;

    if (init.environ_map.get("LOG_LEVEL")) |s| {
        if (parseLogLevel(s)) |lvl| {
            runtime_log_level = lvl;
        } else {
            std.log.warn("Unrecognized LOG_LEVEL={s}, keeping default ({s})", .{ s, @tagName(runtime_log_level) });
        }
    }

    const port: u16 = blk: {
        const s = init.environ_map.get("PORT") orelse break :blk 3030;
        break :blk std.fmt.parseInt(u16, s, 10) catch 3030;
    };

    // Prefer the OpenRouter/API backend (Gemma-4-31B by default, see
    // vlm/openrouter.zig's DEFAULT_MODEL/DEFAULT_BASE_URL) if configured.
    //
    // Unlike the Rust original, this port has no local llama.cpp fallback:
    // that backend binds to llama.cpp/mtmd's C++ API through Rust's
    // llama-cpp-2 crate, which would mean hand-writing untested C bindings
    // and a batch/sampling loop with no way to verify correctness in this
    // environment. The OpenRouter backend is the documented operational
    // default in the original (100% on its 33-image eval), so it's the one
    // ported here; requests fail loudly if it isn't configured.
    const api_key = getEnvAny(init.environ_map, &.{ "LLM_API_KEY", "OPENROUTER_API_KEY" });
    var backend: ?openrouter.LlmApiBackend = null;
    if (api_key) |key| {
        const model = getEnvAny(init.environ_map, &.{ "LLM_MODEL", "OPENROUTER_MODEL" }) orelse openrouter.DEFAULT_MODEL;
        const base_url = getEnvAny(init.environ_map, &.{ "LLM_BASE_URL", "OPENROUTER_BASE_URL" }) orelse openrouter.DEFAULT_BASE_URL;
        backend = openrouter.LlmApiBackend.withBaseUrl(key, model, base_url);
        std.log.info("LLM API VLM backend enabled with model {s}", .{model});
    } else {
        std.log.info("LLM API disabled (set LLM_API_KEY or OPENROUTER_API_KEY to enable)", .{});
    }

    var addr = try net.IpAddress.parse("0.0.0.0", port);
    var net_server = try addr.listen(io, .{ .reuse_address = true });
    std.log.info("running and listening on {d}", .{port});

    const ctx = ConnCtx{ .io = io, .environ = init.environ_map, .backend = backend };

    while (true) {
        const stream = net_server.accept(io) catch |err| {
            std.log.err("accept failed: {s}", .{@errorName(err)});
            continue;
        };
        const thread = std.Thread.spawn(.{}, handleConnection, .{ stream, ctx }) catch |err| {
            std.log.err("failed to spawn connection handler: {s}", .{@errorName(err)});
            stream.close(io);
            continue;
        };
        thread.detach();
    }
}

/// Handles exactly one request per accepted connection, then closes it. The
/// Rust original (warp/hyper) supports HTTP keep-alive; this port trades
/// that away for a much simpler connection lifecycle, which is fine for an
/// internal, low-concurrency service like this one.
fn handleConnection(stream: net.Stream, ctx: ConnCtx) void {
    defer stream.close(ctx.io);

    var arena_state = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena_state.deinit();
    const allocator = arena_state.allocator();

    var recv_buffer: [16 * 1024]u8 = undefined;
    var send_buffer: [16 * 1024]u8 = undefined;
    var stream_reader = stream.reader(ctx.io, &recv_buffer);
    var stream_writer = stream.writer(ctx.io, &send_buffer);
    var server = std.http.Server.init(&stream_reader.interface, &stream_writer.interface);

    var request = server.receiveHead() catch return;
    handleRequest(ctx, allocator, &request) catch |err| {
        std.log.err("error handling request: {s}", .{@errorName(err)});
    };
}

fn handleRequest(ctx: ConnCtx, allocator: std.mem.Allocator, request: *std.http.Server.Request) !void {
    if (request.head.method != .POST or !std.mem.eql(u8, request.head.target, "/label")) {
        return respondNotFound(request);
    }

    checkAuth(ctx, allocator, request) catch |err| {
        std.log.warn("JWT validation failed: {s}", .{@errorName(err)});
        return respondUnauthorized(request);
    };

    const content_type = request.head.content_type orelse return respondNotFound(request);
    const boundary = extractBoundary(content_type) orelse return respondNotFound(request);

    var body_read_buf: [8 * 1024]u8 = undefined;
    const body_reader = try request.readerExpectContinue(&body_read_buf);
    const body = try body_reader.allocRemaining(allocator, .limited(MAX_BODY_BYTES));

    const image_bytes = extractImagePart(body, boundary) orelse return respondNotFound(request);

    const bk = ctx.backend orelse {
        std.log.err("No VLM backend configured (set OPENROUTER_API_KEY)", .{});
        return respondNotFound(request);
    };

    const facts = bk.infer(ctx.io, allocator, image_bytes) catch |err| {
        std.log.err("LLM API VLM failed: {s}", .{@errorName(err)});
        return respondNotFound(request);
    };

    const body_json = try std.json.Stringify.valueAlloc(allocator, .{ .image = facts }, .{});

    try request.respond(body_json, .{
        .keep_alive = false,
        .extra_headers = &.{
            .{ .name = "content-type", .value = "application/json" },
        },
    });
}

fn respondNotFound(request: *std.http.Server.Request) !void {
    try request.respond("{\"error\":\"not found\"}", .{
        .status = .not_found,
        .keep_alive = false,
        .extra_headers = &.{
            .{ .name = "content-type", .value = "application/json" },
            .{ .name = "www-authenticate", .value = "" },
        },
    });
}

fn respondUnauthorized(request: *std.http.Server.Request) !void {
    try request.respond("{\"error\":\"unauthorized\"}", .{
        .status = .unauthorized,
        .keep_alive = false,
        .extra_headers = &.{
            .{ .name = "content-type", .value = "application/json" },
            .{ .name = "www-authenticate", .value = "Bearer" },
        },
    });
}

fn checkAuth(ctx: ConnCtx, allocator: std.mem.Allocator, request: *std.http.Server.Request) !void {
    var it = request.iterateHeaders();
    var auth_header: ?[]const u8 = null;
    while (it.next()) |h| {
        if (std.ascii.eqlIgnoreCase(h.name, "authorization")) {
            auth_header = h.value;
            break;
        }
    }
    const header_value = auth_header orelse return error.MissingAuthorizationHeader;
    const token = if (std.mem.startsWith(u8, header_value, "Bearer "))
        header_value["Bearer ".len..]
    else
        return error.MissingBearerPrefix;

    const secret = ctx.environ.get("HASURA_GRAPHQL_JWT_SECRET") orelse return error.MissingJwtSecretConfig;
    const audience = ctx.environ.get("AUTH0_AUDIENCE") orelse auth.DEFAULT_AUDIENCE;

    try auth.validateJwt(ctx.io, allocator, token, secret, audience);
}

/// Extracts the boundary token from a `multipart/form-data; boundary=...`
/// Content-Type header value, handling both quoted and unquoted forms.
fn extractBoundary(content_type: []const u8) ?[]const u8 {
    const needle = "boundary=";
    const idx = std.mem.indexOf(u8, content_type, needle) orelse return null;
    var b = content_type[idx + needle.len ..];
    if (b.len > 0 and b[0] == '"') {
        b = b[1..];
        const end = std.mem.indexOfScalar(u8, b, '"') orelse b.len;
        return b[0..end];
    }
    const semi = std.mem.indexOfScalar(u8, b, ';');
    return if (semi) |s| b[0..s] else b;
}

/// Scans a `multipart/form-data` body for the part named "image" and
/// returns its raw content bytes (a slice into `body`).
fn extractImagePart(body: []const u8, boundary: []const u8) ?[]const u8 {
    var delim_buf: [256]u8 = undefined;
    const delim = std.fmt.bufPrint(&delim_buf, "--{s}", .{boundary}) catch return null;

    var pos: usize = 0;
    while (true) {
        const start = std.mem.indexOfPos(u8, body, pos, delim) orelse return null;
        var part_start = start + delim.len;

        if (part_start + 1 < body.len and body[part_start] == '-' and body[part_start + 1] == '-') {
            return null; // closing boundary
        }
        if (part_start + 1 < body.len and body[part_start] == '\r' and body[part_start + 1] == '\n') {
            part_start += 2;
        }

        const headers_end = std.mem.indexOfPos(u8, body, part_start, "\r\n\r\n") orelse return null;
        const headers = body[part_start..headers_end];
        const content_start = headers_end + 4;

        const next_boundary = std.mem.indexOfPos(u8, body, content_start, delim) orelse return null;
        var content_end = next_boundary;
        if (content_end >= 2 and body[content_end - 2] == '\r' and body[content_end - 1] == '\n') {
            content_end -= 2;
        }
        const content = body[content_start..content_end];

        if (std.mem.indexOf(u8, headers, "name=\"image\"") != null) {
            return content;
        }

        pos = next_boundary;
    }
}

test "extractBoundary handles unquoted and quoted boundaries" {
    try std.testing.expectEqualStrings("abc123", extractBoundary("multipart/form-data; boundary=abc123").?);
    try std.testing.expectEqualStrings("abc 123", extractBoundary("multipart/form-data; boundary=\"abc 123\"").?);
    try std.testing.expectEqual(@as(?[]const u8, null), extractBoundary("application/json"));
}

test "extractImagePart finds the named part among several" {
    const body = "--BOUNDARY\r\n" ++
        "Content-Disposition: form-data; name=\"other\"\r\n\r\n" ++
        "ignored\r\n" ++
        "--BOUNDARY\r\n" ++
        "Content-Disposition: form-data; name=\"image\"; filename=\"a.jpg\"\r\n" ++
        "Content-Type: image/jpeg\r\n\r\n" ++
        "\x01\x02\xff\x00binary" ++
        "\r\n--BOUNDARY--\r\n";

    const got = extractImagePart(body, "BOUNDARY").?;
    try std.testing.expectEqualSlices(u8, "\x01\x02\xff\x00binary", got);
}

test "extractImagePart returns null when no image part present" {
    const body = "--BOUNDARY\r\n" ++
        "Content-Disposition: form-data; name=\"other\"\r\n\r\n" ++
        "ignored\r\n" ++
        "--BOUNDARY--\r\n";
    try std.testing.expectEqual(@as(?[]const u8, null), extractImagePart(body, "BOUNDARY"));
}

test "parseLogLevel accepts all documented spellings case-insensitively" {
    try std.testing.expectEqual(@as(?std.log.Level, .debug), parseLogLevel("debug"));
    try std.testing.expectEqual(@as(?std.log.Level, .debug), parseLogLevel("DEBUG"));
    try std.testing.expectEqual(@as(?std.log.Level, .info), parseLogLevel("info"));
    try std.testing.expectEqual(@as(?std.log.Level, .warn), parseLogLevel("warn"));
    try std.testing.expectEqual(@as(?std.log.Level, .warn), parseLogLevel("WARNING"));
    try std.testing.expectEqual(@as(?std.log.Level, .err), parseLogLevel("error"));
    try std.testing.expectEqual(@as(?std.log.Level, .err), parseLogLevel("err"));
}

test "parseLogLevel rejects unrecognized values" {
    try std.testing.expectEqual(@as(?std.log.Level, null), parseLogLevel("trace"));
    try std.testing.expectEqual(@as(?std.log.Level, null), parseLogLevel(""));
}
