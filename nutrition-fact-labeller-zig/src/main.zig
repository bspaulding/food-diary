const std = @import("std");
const root = @import("nutrition_fact_labeller");
const auth = @import("auth.zig");
const openrouter = @import("vlm/openrouter.zig");

const MAX_BODY_BYTES: usize = 50 * 1024 * 1024;

pub fn main() !void {
    const gpa = std.heap.page_allocator;

    const port: u16 = blk: {
        const s = std.process.getEnvVarOwned(gpa, "PORT") catch break :blk 3030;
        defer gpa.free(s);
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
    const api_key = try getEnvAny(gpa, &.{ "LLM_API_KEY", "OPENROUTER_API_KEY" });
    var backend: ?openrouter.LlmApiBackend = null;
    if (api_key) |key| {
        const model = (try getEnvAny(gpa, &.{ "LLM_MODEL", "OPENROUTER_MODEL" })) orelse
            try gpa.dupe(u8, openrouter.DEFAULT_MODEL);
        backend = try openrouter.LlmApiBackend.init(gpa, key, model);
        std.log.info("LLM API VLM backend enabled with model {s}", .{model});
    } else {
        std.log.info("LLM API disabled (set LLM_API_KEY or OPENROUTER_API_KEY to enable)", .{});
    }

    const address = try std.net.Address.parseIp("0.0.0.0", port);
    var net_server = try address.listen(.{ .reuse_address = true });
    std.log.info("running and listening on {d}", .{port});

    while (true) {
        const connection = net_server.accept() catch |err| {
            std.log.err("accept failed: {s}", .{@errorName(err)});
            continue;
        };
        const thread = std.Thread.spawn(.{}, handleConnection, .{ connection, backend }) catch |err| {
            std.log.err("failed to spawn connection handler: {s}", .{@errorName(err)});
            connection.stream.close();
            continue;
        };
        thread.detach();
    }
}

/// Handles exactly one request per accepted connection, then closes it. The
/// Rust original (warp/hyper) supports HTTP keep-alive; this port trades
/// that away for a much simpler connection lifecycle, which is fine for an
/// internal, low-concurrency service like this one.
fn handleConnection(connection: std.net.Server.Connection, backend: ?openrouter.LlmApiBackend) void {
    defer connection.stream.close();

    var arena_state = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena_state.deinit();
    const allocator = arena_state.allocator();

    var read_buffer: [16 * 1024]u8 = undefined;
    var server = std.http.Server.init(connection, &read_buffer);

    var request = server.receiveHead() catch return;
    handleRequest(allocator, &request, backend) catch |err| {
        std.log.err("error handling request: {s}", .{@errorName(err)});
    };
}

fn handleRequest(allocator: std.mem.Allocator, request: *std.http.Server.Request, backend: ?openrouter.LlmApiBackend) !void {
    if (request.head.method != .POST or !std.mem.eql(u8, request.head.target, "/label")) {
        return respondNotFound(request);
    }

    checkAuth(allocator, request) catch |err| {
        std.log.warn("JWT validation failed: {s}", .{@errorName(err)});
        return respondUnauthorized(request);
    };

    const content_type = request.head.content_type orelse return respondNotFound(request);
    const boundary = extractBoundary(content_type) orelse return respondNotFound(request);

    const body_reader = try request.reader();
    const body = try body_reader.readAllAlloc(allocator, MAX_BODY_BYTES);

    const image_bytes = extractImagePart(body, boundary) orelse return respondNotFound(request);

    const bk = backend orelse {
        std.log.err("No VLM backend configured (set OPENROUTER_API_KEY)", .{});
        return respondNotFound(request);
    };

    const facts = bk.infer(allocator, image_bytes) catch |err| {
        std.log.err("LLM API VLM failed: {s}", .{@errorName(err)});
        return respondNotFound(request);
    };

    var buf = std.ArrayList(u8).init(allocator);
    try std.json.stringify(.{ .image = facts }, .{}, buf.writer());

    try request.respond(buf.items, .{
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

fn checkAuth(allocator: std.mem.Allocator, request: *std.http.Server.Request) !void {
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

    const secret = (try getEnvAny(allocator, &.{"HASURA_GRAPHQL_JWT_SECRET"})) orelse
        return error.MissingJwtSecretConfig;
    const audience = (try getEnvAny(allocator, &.{"AUTH0_AUDIENCE"})) orelse auth.DEFAULT_AUDIENCE;

    try auth.validateJwt(allocator, token, secret, audience);
}

/// Tries each env var name in order, returning the first one that's set.
fn getEnvAny(allocator: std.mem.Allocator, names: []const []const u8) !?[]u8 {
    for (names) |name| {
        return std.process.getEnvVarOwned(allocator, name) catch |err| switch (err) {
            error.EnvironmentVariableNotFound => continue,
            else => return err,
        };
    }
    return null;
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
