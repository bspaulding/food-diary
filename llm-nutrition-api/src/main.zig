const std = @import("std");
const root = @import("llm_nutrition_api");
const auth = @import("auth.zig");
const openrouter = @import("openrouter.zig");
const agent = @import("llm/agent.zig");
const net = std.Io.net;

const MAX_UPLOAD_BODY_BYTES: usize = 50 * 1024 * 1024;
const MAX_LOOKUP_BODY_BYTES: usize = 16 * 1024;

var next_request_id = std.atomic.Value(u64).init(1);
fn nextRequestId() u64 {
    return next_request_id.fetchAdd(1, .monotonic);
}

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

/// Resolved once at startup from `HASURA_GRAPHQL_JWT_SECRET`/`AUTH0_AUDIENCE`
/// (see `main`), rather than re-reading the raw environment on every
/// request the way the LLM backend config already avoided doing.
const AuthConfig = struct {
    jwt_secret: []const u8,
    audience: []const u8,
};

const ConnCtx = struct {
    auth_config: ?AuthConfig,
    upload_config: ?root.LlmConfig,
    lookup_config: ?root.LlmConfig,
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

    // /upload and /lookup share one LLM backend config -- one default model
    // (root.DEFAULT_MODEL/DEFAULT_BASE_URL, the vision endpoint's
    // operational default, 100% on its 33-image eval) and one
    // LLM_MODEL/LLM_BASE_URL (or OPENROUTER_*) override for both, rather
    // than each endpoint independently defaulting to a different provider.
    //
    // Neither endpoint has a local-inference fallback: only hosted-provider
    // proxying is supported, and requests fail loudly if no backend is
    // configured.
    const api_key = root.getEnvAny(init.environ_map, &.{ "LLM_API_KEY", "OPENROUTER_API_KEY" }, "");
    const model_override = root.getEnvAny(init.environ_map, &.{ "LLM_MODEL", "OPENROUTER_MODEL" }, "");
    const base_url_override = root.getEnvAny(init.environ_map, &.{ "LLM_BASE_URL", "OPENROUTER_BASE_URL" }, "");

    var upload_config: ?root.LlmConfig = null;
    var lookup_config: ?root.LlmConfig = null;
    if (api_key.len > 0) {
        const model = if (model_override.len > 0) model_override else root.DEFAULT_MODEL;
        const base_url = if (base_url_override.len > 0) base_url_override else root.DEFAULT_BASE_URL;
        const cfg = root.LlmConfig{ .api_key = api_key, .model = model, .base_url = base_url };
        upload_config = cfg;
        lookup_config = cfg;
        std.log.info("LLM API backend enabled with model {s}", .{model});
    } else {
        std.log.info("LLM API disabled (set LLM_API_KEY or OPENROUTER_API_KEY to enable)", .{});
    }

    // Resolved once here instead of re-reading the raw environment map on
    // every request (as the LLM backend config above already avoided
    // doing) -- also means ConnCtx no longer needs to carry the whole
    // environ map just for these two values.
    const auth_config: ?AuthConfig = if (init.environ_map.get("HASURA_GRAPHQL_JWT_SECRET")) |secret|
        AuthConfig{
            .jwt_secret = secret,
            .audience = init.environ_map.get("AUTH0_AUDIENCE") orelse auth.DEFAULT_AUDIENCE,
        }
    else
        null;

    var addr = try net.IpAddress.parse("0.0.0.0", port);
    var net_server = try addr.listen(io, .{ .reuse_address = true });
    std.log.info("running and listening on {d}", .{port});

    const ctx = ConnCtx{ .auth_config = auth_config, .upload_config = upload_config, .lookup_config = lookup_config };

    while (true) {
        const stream = net_server.accept(io) catch |err| {
            std.log.err("accept failed: {s}", .{@errorName(err)});
            continue;
        };
        const thread = std.Thread.spawn(.{}, handleConnection, .{ stream, io, ctx }) catch |err| {
            std.log.err("failed to spawn connection handler: {s}", .{@errorName(err)});
            stream.close(io);
            continue;
        };
        thread.detach();
    }
}

/// Handles exactly one request per accepted connection, then closes it --
/// a much simpler connection lifecycle than HTTP keep-alive, which is fine
/// for an internal, low-concurrency service like this one.
fn handleConnection(stream: net.Stream, io: std.Io, ctx: ConnCtx) void {
    defer stream.close(io);

    var arena_state = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena_state.deinit();
    const env = root.Env{ .io = io, .allocator = arena_state.allocator() };

    var recv_buffer: [16 * 1024]u8 = undefined;
    var send_buffer: [16 * 1024]u8 = undefined;
    var stream_reader = stream.reader(env.io, &recv_buffer);
    var stream_writer = stream.writer(env.io, &send_buffer);
    var server = std.http.Server.init(&stream_reader.interface, &stream_writer.interface);

    var request = server.receiveHead() catch return;
    handleRequest(ctx, env, &request) catch |err| {
        std.log.err("error handling request: {s}", .{@errorName(err)});
    };
}

fn handleRequest(ctx: ConnCtx, env: root.Env, request: *std.http.Server.Request) !void {
    if (request.head.method != .POST) return respondNotFound(request);

    if (std.mem.eql(u8, request.head.target, "/upload")) {
        return handleUpload(ctx, env, request);
    }
    if (std.mem.eql(u8, request.head.target, "/lookup")) {
        return handleLookup(ctx, env, request);
    }
    return respondNotFound(request);
}

fn handleUpload(ctx: ConnCtx, env: root.Env, request: *std.http.Server.Request) !void {
    checkAuth(ctx, env, request) catch |err| {
        std.log.warn("JWT validation failed: {s}", .{@errorName(err)});
        return respondUnauthorized(request);
    };

    const request_id = nextRequestId();
    std.log.info("[{d}] Upload request received", .{request_id});

    const content_type = request.head.content_type orelse {
        std.log.warn("[{d}] Upload rejected: missing content-type", .{request_id});
        return respondError(request, .bad_request, "missing content-type");
    };
    const boundary = extractBoundary(content_type) orelse {
        std.log.warn("[{d}] Upload rejected: missing multipart boundary (content-type: {s})", .{ request_id, content_type });
        return respondError(request, .bad_request, "missing multipart boundary");
    };

    var body_read_buf: [8 * 1024]u8 = undefined;
    const body_reader = try request.readerExpectContinue(&body_read_buf);
    const body = try body_reader.allocRemaining(env.allocator, .limited(MAX_UPLOAD_BODY_BYTES));
    std.log.debug("[{d}] Upload body size: {d} bytes", .{ request_id, body.len });

    const image_bytes = extractImagePart(body, boundary) orelse {
        std.log.warn("[{d}] Upload rejected: missing image part (body size: {d} bytes)", .{ request_id, body.len });
        return respondError(request, .bad_request, "missing image part");
    };
    std.log.debug("[{d}] Upload image size: {d} bytes", .{ request_id, image_bytes.len });

    const cfg = ctx.upload_config orelse {
        std.log.err("[{d}] No VLM backend configured (set LLM_API_KEY or OPENROUTER_API_KEY)", .{request_id});
        return respondError(request, .internal_server_error, "no backend configured");
    };

    var req_env = env;
    req_env.request_id = request_id;

    const started = std.Io.Clock.real.now(env.io);
    const facts = openrouter.infer(cfg, req_env, image_bytes) catch |err| {
        std.log.err("[{d}] LLM API VLM failed: {s}", .{ request_id, @errorName(err) });
        return respondError(request, .internal_server_error, "upload failed");
    };
    const elapsed_secs = std.Io.Clock.real.now(env.io).toSeconds() - started.toSeconds();
    std.log.info("[{d}] Upload succeeded ({d}s)", .{ request_id, elapsed_secs });

    const body_json = try std.json.Stringify.valueAlloc(env.allocator, .{ .image = facts }, .{});

    try request.respond(body_json, .{
        .keep_alive = false,
        .extra_headers = &.{
            .{ .name = "content-type", .value = "application/json" },
        },
    });
}

const LookupRequest = struct { description: []const u8 };

fn handleLookup(ctx: ConnCtx, env: root.Env, request: *std.http.Server.Request) !void {
    checkAuth(ctx, env, request) catch |err| {
        std.log.warn("JWT validation failed: {s}", .{@errorName(err)});
        return respondUnauthorized(request);
    };

    var body_read_buf: [8 * 1024]u8 = undefined;
    const body_reader = try request.readerExpectContinue(&body_read_buf);
    const body = try body_reader.allocRemaining(env.allocator, .limited(MAX_LOOKUP_BODY_BYTES));

    const parsed = std.json.parseFromSlice(LookupRequest, env.allocator, body, .{ .ignore_unknown_fields = true }) catch {
        return respondError(request, .bad_request, "invalid request body");
    };

    const cfg = ctx.lookup_config orelse {
        std.log.err("No LLM backend configured (set LLM_API_KEY or OPENROUTER_API_KEY)", .{});
        return respondError(request, .internal_server_error, "no backend configured");
    };

    const request_id = nextRequestId();
    var req_env = env;
    req_env.request_id = request_id;

    std.log.info("[{d}] Lookup request: {s}", .{ request_id, parsed.value.description });
    const started = std.Io.Clock.real.now(env.io);

    const item = agent.runAgent(req_env, cfg, parsed.value.description) catch |err| {
        std.log.err("[{d}] Lookup failed: {s}", .{ request_id, @errorName(err) });
        return respondError(request, .internal_server_error, "lookup failed");
    };
    const elapsed_secs = std.Io.Clock.real.now(env.io).toSeconds() - started.toSeconds();
    std.log.info("[{d}] Lookup succeeded ({d}s)", .{ request_id, elapsed_secs });

    const body_json = try std.json.Stringify.valueAlloc(env.allocator, .{ .item = item }, .{});

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

fn respondError(request: *std.http.Server.Request, status: std.http.Status, message: []const u8) !void {
    var buf: [256]u8 = undefined;
    const body = std.fmt.bufPrint(&buf, "{{\"error\":\"{s}\"}}", .{message}) catch "{\"error\":\"error\"}";
    try request.respond(body, .{
        .status = status,
        .keep_alive = false,
        .extra_headers = &.{
            .{ .name = "content-type", .value = "application/json" },
        },
    });
}

fn checkAuth(ctx: ConnCtx, env: root.Env, request: *std.http.Server.Request) !void {
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

    const auth_config = ctx.auth_config orelse return error.MissingJwtSecretConfig;

    try auth.validateJwt(env, token, auth_config.jwt_secret, auth_config.audience);
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
