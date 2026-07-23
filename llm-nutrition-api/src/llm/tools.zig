const std = @import("std");
const root = @import("llm_nutrition_api");

/// Simplified/hand-rolled web tools for the nutrition-lookup agent —
/// deliberately not a faithful port of the Rust original's `websearch`
/// (DuckDuckGo provider crate) or `dom_smoothie` (Mozilla-Readability-style
/// article extraction) dependencies, which have no Zig equivalent. Instead:
/// `searchWeb` scrapes DuckDuckGo's no-JS HTML endpoint with substring/tag
/// scanning (no real HTML parser), and `readWebpage` strips all HTML tags
/// down to plain text rather than identifying the "main article" content.
/// Validated against the real eval harness (`eval/run_evals.py`) rather than
/// against a reference implementation, per the tradeoff this port accepts.
const USER_AGENT = "Mozilla/5.0 (compatible; llm-nutrition-api/1.0; +https://food-diary.motingo.com)";
const MAX_SEARCH_RESULTS: usize = 5;
const READ_WEBPAGE_MAX_CHARS: usize = 4000;
const MAX_RESPONSE_BYTES: usize = 4 << 20;

pub const ToolError = error{
    RequestFailed,
    HttpError,
} || std.mem.Allocator.Error;

pub fn searchWeb(env: root.Env, arena: std.mem.Allocator, query: []const u8) ToolError![]const u8 {
    const encoded_query = try urlEncode(arena, query);
    const url = try std.fmt.allocPrint(arena, "https://html.duckduckgo.com/html/?q={s}", .{encoded_query});
    const html = try httpGet(env, arena, url);
    const results = try parseSearchResults(arena, html);
    if (results.len == 0) return "";

    var parts: std.ArrayList([]const u8) = .empty;
    for (results) |r| {
        const part = try std.fmt.allocPrint(arena, "Title: {s}\nURL: {s}\nSnippet: {s}\n---", .{ r.title, r.url, r.snippet });
        try parts.append(arena, part);
    }
    return std.mem.join(arena, "\n", parts.items);
}

pub fn readWebpage(env: root.Env, arena: std.mem.Allocator, url: []const u8) ToolError![]const u8 {
    const html = try httpGet(env, arena, url);
    const text = try htmlToText(arena, html);
    return truncateUtf8(text, READ_WEBPAGE_MAX_CHARS);
}

fn httpGet(env: root.Env, arena: std.mem.Allocator, url: []const u8) ToolError![]const u8 {
    const uri = std.Uri.parse(url) catch return error.RequestFailed;

    var client = std.http.Client{ .allocator = arena, .io = env.io };
    defer client.deinit();

    var req = client.request(.GET, uri, .{
        .headers = .{ .user_agent = .{ .override = USER_AGENT } },
    }) catch return error.RequestFailed;
    defer req.deinit();

    req.sendBodiless() catch return error.RequestFailed;

    var redirect_buf: [4096]u8 = undefined;
    var response = req.receiveHead(&redirect_buf) catch return error.RequestFailed;
    if (response.head.status.class() != .success) return error.HttpError;

    // Real servers (DuckDuckGo, arbitrary webpages) commonly gzip-compress
    // responses; `Response.reader` alone returns the *compressed* bytes, so
    // this must decompress explicitly (std.http.Client negotiates
    // gzip/deflate by default via Accept-Encoding).
    var transfer_buf: [8192]u8 = undefined;
    const decompress_buffer: []u8 = switch (response.head.content_encoding) {
        .identity => &.{},
        .deflate, .gzip => try arena.alloc(u8, std.compress.flate.max_window_len),
        .zstd, .compress => return error.RequestFailed, // not advertised in Accept-Encoding; shouldn't happen
    };
    var decompress: std.http.Decompress = undefined;
    const reader = response.readerDecompressing(&transfer_buf, &decompress, decompress_buffer);
    return reader.allocRemaining(arena, .limited(MAX_RESPONSE_BYTES)) catch return error.RequestFailed;
}

fn urlEncode(arena: std.mem.Allocator, s: []const u8) ![]const u8 {
    var out: std.ArrayList(u8) = .empty;
    for (s) |c| {
        switch (c) {
            'A'...'Z', 'a'...'z', '0'...'9', '-', '_', '.', '~' => try out.append(arena, c),
            ' ' => try out.append(arena, '+'),
            else => try out.print(arena, "%{X:0>2}", .{c}),
        }
    }
    return out.items;
}

const SearchResult = struct {
    title: []const u8,
    url: []const u8,
    snippet: []const u8,
};

/// Scans DuckDuckGo's `html.duckduckgo.com/html/` markup for
/// `class="result__a"` (title+link) and `class="result__snippet"` anchors,
/// in document order, pairing them up positionally. Fragile against DDG
/// markup changes by construction — this is the "simplified/hand-rolled"
/// tradeoff, not a real HTML parser.
fn parseSearchResults(arena: std.mem.Allocator, html: []const u8) ![]SearchResult {
    var results: std.ArrayList(SearchResult) = .empty;

    var pos: usize = 0;
    while (results.items.len < MAX_SEARCH_RESULTS) {
        const a_start = findTagWithClass(html, pos, "a", "result__a") orelse break;
        const a_tag_end = std.mem.indexOfScalarPos(u8, html, a_start, '>') orelse break;
        const href = extractAttr(html[a_start..a_tag_end], "href") orelse {
            pos = a_tag_end + 1;
            continue;
        };
        const a_close = std.mem.indexOfPos(u8, html, a_tag_end, "</a>") orelse break;
        const title_raw = html[a_tag_end + 1 .. a_close];
        const title = try decodeInnerText(arena, title_raw);

        var snippet: []const u8 = "";
        if (findTagWithClass(html, a_close, "a", "result__snippet") orelse
            findTagWithClass(html, a_close, "div", "result__snippet")) |s_start|
        {
            if (std.mem.indexOfScalarPos(u8, html, s_start, '>')) |s_tag_end| {
                const s_close = std.mem.indexOfPos(u8, html, s_tag_end, "</a>") orelse
                    std.mem.indexOfPos(u8, html, s_tag_end, "</div>") orelse html.len;
                snippet = try decodeInnerText(arena, html[s_tag_end + 1 .. s_close]);
            }
        }

        const real_url = decodeDdgRedirect(arena, href) catch href;
        try results.append(arena, .{ .title = title, .url = real_url, .snippet = snippet });

        pos = a_close + 4;
    }

    return results.items;
}

/// Finds the start index of the next `<tag ...class="...needle..."...>` at
/// or after `from`. Handles the class attribute appearing anywhere among
/// the tag's attributes and matches `needle` as one of possibly several
/// space-separated class names.
fn findTagWithClass(html: []const u8, from: usize, tag: []const u8, needle: []const u8) ?usize {
    var pos = from;
    while (true) {
        var open_buf: [64]u8 = undefined;
        const open = std.fmt.bufPrint(&open_buf, "<{s}", .{tag}) catch return null;
        const start = std.mem.indexOfPos(u8, html, pos, open) orelse return null;
        const tag_end = std.mem.indexOfScalarPos(u8, html, start, '>') orelse return null;
        const tag_src = html[start..tag_end];

        if (extractAttr(tag_src, "class")) |class_val| {
            var classes = std.mem.splitScalar(u8, class_val, ' ');
            while (classes.next()) |c| {
                if (std.mem.eql(u8, c, needle)) return start;
            }
        }
        pos = tag_end + 1;
    }
}

/// Extracts the value of `attr="..."` or `attr='...'` from a tag's raw
/// source text (everything between `<` and the closing `>`).
fn extractAttr(tag_src: []const u8, attr: []const u8) ?[]const u8 {
    var buf: [64]u8 = undefined;
    const needle_dq = std.fmt.bufPrint(&buf, "{s}=\"", .{attr}) catch return null;
    if (std.mem.indexOf(u8, tag_src, needle_dq)) |idx| {
        const val_start = idx + needle_dq.len;
        const val_end = std.mem.indexOfScalarPos(u8, tag_src, val_start, '"') orelse return null;
        return tag_src[val_start..val_end];
    }
    var buf2: [64]u8 = undefined;
    const needle_sq = std.fmt.bufPrint(&buf2, "{s}='", .{attr}) catch return null;
    if (std.mem.indexOf(u8, tag_src, needle_sq)) |idx| {
        const val_start = idx + needle_sq.len;
        const val_end = std.mem.indexOfScalarPos(u8, tag_src, val_start, '\'') orelse return null;
        return tag_src[val_start..val_end];
    }
    return null;
}

/// DuckDuckGo's HTML endpoint wraps result links as
/// `//duckduckgo.com/l/?uddg=<url-encoded-target>&rut=...`; this decodes
/// the `uddg` query parameter to recover the real target URL.
fn decodeDdgRedirect(arena: std.mem.Allocator, href: []const u8) ![]const u8 {
    const marker = "uddg=";
    const idx = std.mem.indexOf(u8, href, marker) orelse return href;
    const val_start = idx + marker.len;
    const val_end = std.mem.indexOfScalarPos(u8, href, val_start, '&') orelse href.len;
    const encoded = href[val_start..val_end];
    return urlDecode(arena, encoded);
}

fn urlDecode(arena: std.mem.Allocator, s: []const u8) ![]const u8 {
    var out: std.ArrayList(u8) = .empty;
    var i: usize = 0;
    while (i < s.len) {
        if (s[i] == '%' and i + 2 < s.len) {
            const byte = std.fmt.parseInt(u8, s[i + 1 .. i + 3], 16) catch {
                try out.append(arena, s[i]);
                i += 1;
                continue;
            };
            try out.append(arena, byte);
            i += 3;
        } else if (s[i] == '+') {
            try out.append(arena, ' ');
            i += 1;
        } else {
            try out.append(arena, s[i]);
            i += 1;
        }
    }
    return out.items;
}

/// Strips nested tags (e.g. DDG bolding query terms with `<b>`) and
/// HTML-entity-decodes the result, collapsing runs of whitespace to a
/// single space.
fn decodeInnerText(arena: std.mem.Allocator, raw: []const u8) ![]const u8 {
    const stripped = try stripTags(arena, raw);
    const decoded = try decodeEntities(arena, stripped);
    return collapseWhitespace(arena, decoded);
}

fn stripTags(arena: std.mem.Allocator, html: []const u8) ![]const u8 {
    var out: std.ArrayList(u8) = .empty;
    var in_tag = false;
    for (html) |c| {
        switch (c) {
            '<' => in_tag = true,
            '>' => in_tag = false,
            else => if (!in_tag) try out.append(arena, c),
        }
    }
    return out.items;
}

const named_entities = [_]struct { name: []const u8, value: []const u8 }{
    .{ .name = "&amp;", .value = "&" },
    .{ .name = "&lt;", .value = "<" },
    .{ .name = "&gt;", .value = ">" },
    .{ .name = "&quot;", .value = "\"" },
    .{ .name = "&#39;", .value = "'" },
    .{ .name = "&apos;", .value = "'" },
    .{ .name = "&nbsp;", .value = " " },
};

fn decodeEntities(arena: std.mem.Allocator, s: []const u8) ![]const u8 {
    var out: std.ArrayList(u8) = .empty;
    var i: usize = 0;
    outer: while (i < s.len) {
        if (s[i] == '&') {
            for (named_entities) |e| {
                if (std.mem.startsWith(u8, s[i..], e.name)) {
                    try out.appendSlice(arena, e.value);
                    i += e.name.len;
                    continue :outer;
                }
            }
            if (std.mem.startsWith(u8, s[i..], "&#") and i + 2 < s.len) {
                if (std.mem.indexOfScalarPos(u8, s, i, ';')) |semi| {
                    if (std.fmt.parseInt(u21, s[i + 2 .. semi], 10) catch null) |code| {
                        var buf: [4]u8 = undefined;
                        const len = std.unicode.utf8Encode(code, &buf) catch 0;
                        if (len > 0) {
                            try out.appendSlice(arena, buf[0..len]);
                            i = semi + 1;
                            continue :outer;
                        }
                    }
                }
            }
        }
        try out.append(arena, s[i]);
        i += 1;
    }
    return out.items;
}

fn collapseWhitespace(arena: std.mem.Allocator, s: []const u8) ![]const u8 {
    var out: std.ArrayList(u8) = .empty;
    var last_was_space = true; // trims leading whitespace
    for (s) |c| {
        if (std.ascii.isWhitespace(c)) {
            if (!last_was_space) try out.append(arena, ' ');
            last_was_space = true;
        } else {
            try out.append(arena, c);
            last_was_space = false;
        }
    }
    var result = out.items;
    if (result.len > 0 and result[result.len - 1] == ' ') result = result[0 .. result.len - 1];
    return result;
}

/// Converts arbitrary HTML into plain text for `readWebpage`: drops
/// `<script>`/`<style>` blocks entirely (including their content), strips
/// all remaining tags, entity-decodes, and collapses whitespace. Not a
/// Readability-style "main content" extractor — see module doc comment.
fn htmlToText(arena: std.mem.Allocator, html: []const u8) ![]const u8 {
    const no_scripts = try stripBlocks(arena, html, "script");
    const no_styles = try stripBlocks(arena, no_scripts, "style");
    const stripped = try stripTags(arena, no_styles);
    const decoded = try decodeEntities(arena, stripped);
    return collapseWhitespace(arena, decoded);
}

fn stripBlocks(arena: std.mem.Allocator, html: []const u8, tag: []const u8) ![]const u8 {
    var out: std.ArrayList(u8) = .empty;
    var open_buf: [32]u8 = undefined;
    var close_buf: [32]u8 = undefined;
    const open_needle = std.fmt.bufPrint(&open_buf, "<{s}", .{tag}) catch return html;
    const close_needle = std.fmt.bufPrint(&close_buf, "</{s}>", .{tag}) catch return html;

    var pos: usize = 0;
    while (true) {
        const start = std.mem.indexOfPos(u8, html, pos, open_needle) orelse {
            try out.appendSlice(arena, html[pos..]);
            break;
        };
        try out.appendSlice(arena, html[pos..start]);
        const close = std.mem.indexOfPos(u8, html, start, close_needle) orelse {
            break;
        };
        pos = close + close_needle.len;
    }
    return out.items;
}

fn truncateUtf8(s: []const u8, max_len: usize) []const u8 {
    if (s.len <= max_len) return s;
    var end = max_len;
    while (end > 0 and (s[end] & 0xC0) == 0x80) end -= 1;
    return s[0..end];
}

test "urlEncode escapes spaces and special characters" {
    const allocator = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    const encoded = try urlEncode(arena.allocator(), "CLIF BAR 68g!");
    try std.testing.expectEqualStrings("CLIF+BAR+68g%21", encoded);
}

test "urlDecode reverses percent-encoding and plus-as-space" {
    const allocator = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    const decoded = try urlDecode(arena.allocator(), "https%3A%2F%2Fexample.com%2Fa+b");
    try std.testing.expectEqualStrings("https://example.com/a b", decoded);
}

test "decodeDdgRedirect extracts the uddg target URL" {
    const allocator = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    const href = "//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage&rut=abc123";
    const url = try decodeDdgRedirect(arena.allocator(), href);
    try std.testing.expectEqualStrings("https://example.com/page", url);
}

test "stripTags removes nested markup" {
    const allocator = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    const out = try stripTags(arena.allocator(), "Serving size <b>1 bar</b> (68g)");
    try std.testing.expectEqualStrings("Serving size 1 bar (68g)", out);
}

test "decodeEntities handles named and numeric entities" {
    const allocator = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    const out = try decodeEntities(arena.allocator(), "Tom &amp; Jerry&#39;s &lt;pie&gt;");
    try std.testing.expectEqualStrings("Tom & Jerry's <pie>", out);
}

test "collapseWhitespace trims and squashes runs" {
    const allocator = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    const out = try collapseWhitespace(arena.allocator(), "  hello   \n\n world  ");
    try std.testing.expectEqualStrings("hello world", out);
}

test "htmlToText drops script and style blocks" {
    const allocator = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    const html = "<html><head><style>body{color:red}</style></head>" ++
        "<body><script>alert('hi')</script><p>Hello <b>world</b></p></body></html>";
    const out = try htmlToText(arena.allocator(), html);
    try std.testing.expectEqualStrings("Hello world", out);
}

test "parseSearchResults extracts title, url, and snippet" {
    const allocator = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    const html =
        \\<div class="result">
        \\<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fclifbar.com%2Fchocolate-chip&rut=x">CLIF BAR <b>Chocolate Chip</b></a>
        \\<a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fclifbar.com%2Fchocolate-chip">Serving size 1 bar (68g). Calories <b>250</b>.</a>
        \\</div>
    ;
    const results = try parseSearchResults(arena.allocator(), html);
    try std.testing.expectEqual(@as(usize, 1), results.len);
    try std.testing.expectEqualStrings("CLIF BAR Chocolate Chip", results[0].title);
    try std.testing.expectEqualStrings("https://clifbar.com/chocolate-chip", results[0].url);
    try std.testing.expectEqualStrings("Serving size 1 bar (68g). Calories 250.", results[0].snippet);
}

test "truncateUtf8 backs off from a multi-byte boundary" {
    const s = "hello \xc3\xa9world"; // "é" is 2 bytes (0xC3 0xA9)
    const truncated = truncateUtf8(s, 7); // would split the 'é' mid-sequence
    try std.testing.expect(std.unicode.utf8ValidateSlice(truncated));
}

// The two fixtures below were captured live via `curl` during development
// (see llm-nutrition-api/README.md's "Known risks" section) rather than
// hand-written, to validate against real markup instead of only synthetic
// snippets.

test "htmlToText handles a real fetched page (example.com)" {
    const allocator = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    const html = @embedFile("testdata/example_com.html");
    const text = try htmlToText(arena.allocator(), html);
    try std.testing.expect(std.mem.indexOf(u8, text, "Example Domain") != null);
    try std.testing.expect(std.mem.indexOf(u8, text, "<") == null);
}

test "parseSearchResults degrades to zero results (not a crash) against DuckDuckGo's bot-challenge page" {
    // Captured live: html.duckduckgo.com/html/ served an anti-bot CAPTCHA
    // challenge page ("Select all squares containing a duck") instead of
    // real results for every query tried from this environment's egress
    // IP, rather than the expected `result__a`/`result__snippet` markup.
    // This is a real risk of the chosen scraping approach (see README), not
    // an artifact of this test — the important behavior to lock in here is
    // that parsing such a page returns an empty result set gracefully
    // rather than crashing or hanging, so the agent's "search failed, use
    // your best estimate" fallback path still kicks in.
    const allocator = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    const html = @embedFile("testdata/ddg_bot_challenge_response.html");
    const results = try parseSearchResults(arena.allocator(), html);
    try std.testing.expectEqual(@as(usize, 0), results.len);
}
