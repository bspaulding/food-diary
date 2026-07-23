const std = @import("std");

pub const vlm = @import("vlm.zig");
pub const Env = @import("env.zig").Env;

/// Shared hosted-LLM-provider connection config, used by both the vision
/// backend (`openrouter.zig`) and the text-lookup agent (`llm/agent.zig`) --
/// they're structurally identical (both just need an API key, model, and
/// base URL to reach an OpenAI-compatible chat-completions endpoint), so
/// this is the one type both use rather than two separate-but-identical
/// structs.
/// Tries each env var name in order, returning the first one that's set, or
/// `default` if none of them are. Borrowed from `environ`, valid for the
/// process's lifetime. Shared by main.zig and vlm_benchmark_api.zig, which
/// both read the same LLM_* / OPENROUTER_* fallback pairs.
pub fn getEnvAny(environ: *const std.process.Environ.Map, names: []const []const u8, default: []const u8) []const u8 {
    for (names) |name| {
        if (environ.get(name)) |v| return v;
    }
    return default;
}

pub const LlmConfig = struct {
    api_key: []const u8,
    model: []const u8,
    base_url: []const u8,
};

/// Operational default for both `/upload` (vision) and `/lookup` (text) --
/// Gemma-4-31B via OpenRouter scored 100% all-fields / 33/33 whole-record on
/// the full 33-image eval (see the Rust original's eval-results/README.md),
/// a wide margin over every self-hosted candidate. A single shared default
/// rather than one per endpoint, since main.zig already applies one
/// LLM_MODEL/OPENROUTER_MODEL override to both.
pub const DEFAULT_MODEL = "google/gemma-4-31b-it:free";

/// Paired with DEFAULT_MODEL above -- must stay OpenRouter's endpoint, not
/// Gemini's, since DEFAULT_MODEL is an OpenRouter-specific model slug.
pub const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

/// Result schema for `POST /lookup` (text-based nutrition estimation/lookup).
/// Field names and units intentionally differ from `ParsedNutritionFacts`
/// (full words `_milligrams`/`_grams`, singular `carbohydrate`) — both web
/// and iOS clients hardcode these exact names, so the two schemas must stay
/// distinct rather than being unified during the merge.
pub const NutritionItem = struct {
    description: []const u8 = "",
    calories: f64 = 0,
    total_fat_grams: f64 = 0,
    saturated_fat_grams: f64 = 0,
    trans_fat_grams: f64 = 0,
    polyunsaturated_fat_grams: f64 = 0,
    monounsaturated_fat_grams: f64 = 0,
    cholesterol_milligrams: f64 = 0,
    sodium_milligrams: f64 = 0,
    total_carbohydrate_grams: f64 = 0,
    dietary_fiber_grams: f64 = 0,
    total_sugars_grams: f64 = 0,
    added_sugars_grams: f64 = 0,
    protein_grams: f64 = 0,
};

pub const ParsedNutritionFacts = struct {
    servings_per_container: ?f64 = null,
    serving_size_grams: ?f64 = null,
    calories: ?i32 = null,
    total_fat_grams: ?f64 = null,
    saturated_fat_grams: ?f64 = null,
    trans_fat_grams: ?f64 = null,
    polyunsaturated_fat_grams: ?f64 = null,
    monounsaturated_fat_grams: ?f64 = null,
    cholesterol_mg: ?f64 = null,
    sodium_mg: ?f64 = null,
    total_carbohydrates_g: ?f64 = null,
    dietary_fiber_g: ?f64 = null,
    total_sugars_g: ?f64 = null,
    added_sugars_g: ?f64 = null,
    protein_g: ?f64 = null,

    /// Per-field exact-match comparison against `expected`, in `FIELD_NAMES` order.
    pub fn fieldMatches(self: ParsedNutritionFacts, expected: ParsedNutritionFacts) [FIELD_COUNT]bool {
        return .{
            optEql(f64, self.servings_per_container, expected.servings_per_container),
            optEql(f64, self.serving_size_grams, expected.serving_size_grams),
            optEql(i32, self.calories, expected.calories),
            optEql(f64, self.total_fat_grams, expected.total_fat_grams),
            optEql(f64, self.saturated_fat_grams, expected.saturated_fat_grams),
            optEql(f64, self.trans_fat_grams, expected.trans_fat_grams),
            optEql(f64, self.polyunsaturated_fat_grams, expected.polyunsaturated_fat_grams),
            optEql(f64, self.monounsaturated_fat_grams, expected.monounsaturated_fat_grams),
            optEql(f64, self.cholesterol_mg, expected.cholesterol_mg),
            optEql(f64, self.sodium_mg, expected.sodium_mg),
            optEql(f64, self.total_carbohydrates_g, expected.total_carbohydrates_g),
            optEql(f64, self.dietary_fiber_g, expected.dietary_fiber_g),
            optEql(f64, self.total_sugars_g, expected.total_sugars_g),
            optEql(f64, self.added_sugars_g, expected.added_sugars_g),
            optEql(f64, self.protein_g, expected.protein_g),
        };
    }

    pub fn eql(self: ParsedNutritionFacts, other: ParsedNutritionFacts) bool {
        for (self.fieldMatches(other)) |m| {
            if (!m) return false;
        }
        return true;
    }
};

fn optEql(comptime T: type, a: ?T, b: ?T) bool {
    if (a == null and b == null) return true;
    if (a == null or b == null) return false;
    return a.? == b.?;
}

/// Field names in the same order `fieldMatches` returns them, for labeling
/// per-field scoring output.
pub const FIELD_NAMES = [_][]const u8{
    "servings_per_container",
    "serving_size_grams",
    "calories",
    "total_fat_grams",
    "saturated_fat_grams",
    "trans_fat_grams",
    "polyunsaturated_fat_grams",
    "monounsaturated_fat_grams",
    "cholesterol_mg",
    "sodium_mg",
    "total_carbohydrates_g",
    "dietary_fiber_g",
    "total_sugars_g",
    "added_sugars_g",
    "protein_g",
};

pub const FIELD_COUNT: usize = FIELD_NAMES.len;

/// Accumulates per-field correct counts across a set of cases for "all fields"
/// partial-credit scoring. A case that fails to parse at all (see `recordMiss`)
/// still counts toward the denominator but contributes zero correct fields.
pub const FieldScore = struct {
    correct: [FIELD_COUNT]usize = [_]usize{0} ** FIELD_COUNT,
    total_cases: usize = 0,

    pub fn record(self: *FieldScore, matches: [FIELD_COUNT]bool) void {
        for (matches, 0..) |m, i| {
            if (m) self.correct[i] += 1;
        }
        self.total_cases += 1;
    }

    /// Records a case that couldn't be scored at all (e.g. the model's output
    /// failed to parse into `ParsedNutritionFacts`). Still counts toward the
    /// denominator.
    pub fn recordMiss(self: *FieldScore) void {
        self.total_cases += 1;
    }

    pub fn totalCorrect(self: FieldScore) usize {
        var sum: usize = 0;
        for (self.correct) |c| sum += c;
        return sum;
    }

    pub fn totalFields(self: FieldScore) usize {
        return self.total_cases * FIELD_COUNT;
    }

    pub fn percent(self: FieldScore) f64 {
        const total = self.totalFields();
        if (total == 0) return 0.0;
        return 100.0 * @as(f64, @floatFromInt(self.totalCorrect())) / @as(f64, @floatFromInt(total));
    }
};

/// Prints the "all fields" partial-credit summary line and per-field
/// breakdown for one model's `FieldScore`.
pub fn printFieldScore(env: Env, score: FieldScore) void {
    var buf: [4096]u8 = undefined;
    var file_writer = std.Io.File.stdout().writer(env.io, &buf);
    const w = &file_writer.interface;
    w.print(
        "  All-fields: {d}/{d} ({d:.1}%) — prioritize this over whole-record pass/fail\n",
        .{ score.totalCorrect(), score.totalFields(), score.percent() },
    ) catch return;
    w.writeAll("  Per-field:  ") catch return;
    for (FIELD_NAMES, 0..) |field, i| {
        w.print("{s}={d}/{d} ", .{ field, score.correct[i], score.total_cases }) catch return;
    }
    w.writeAll("\n") catch return;
    w.flush() catch return;
}

pub const TestCase = struct {
    filename: []const u8,
    expected: ParsedNutritionFacts,
};

/// Load test cases from a CSV file with columns:
/// file,servings_per_container,serving_size_grams,calories,total_fat_grams,
/// saturated_fat_grams,trans_fat_grams,polyunsaturated_fat_grams,
/// monounsaturated_fat_grams,cholesterol_mg,sodium_mg,total_carbohydrates_g,
/// dietary_fiber_g,total_sugars_g,added_sugars_g,protein_g
/// All fields are double-quoted. An empty field parses to `null`.
pub fn loadTestCases(env: Env, csv_path: []const u8) ![]TestCase {
    const allocator = env.allocator;
    const content = try std.Io.Dir.cwd().readFileAlloc(env.io, csv_path, allocator, .limited(16 * 1024 * 1024));
    defer allocator.free(content);

    var cases: std.ArrayList(TestCase) = .empty;
    errdefer cases.deinit(allocator);

    var lines = std.mem.splitScalar(u8, content, '\n');
    _ = lines.next(); // header row

    while (lines.next()) |raw_line| {
        const line = std.mem.trimEnd(u8, raw_line, "\r");
        if (line.len == 0) continue;

        const trimmed = std.mem.trim(u8, line, "\"");
        var fields = std.mem.splitSequence(u8, trimmed, "\",\"");

        const filename = fields.next() orelse return error.InvalidCsvRow;

        var values: [FIELD_COUNT]?f64 = undefined;
        for (0..FIELD_COUNT) |i| {
            const tok = fields.next() orelse return error.InvalidCsvRow;
            values[i] = if (tok.len == 0) null else try std.fmt.parseFloat(f64, tok);
        }

        const expected = ParsedNutritionFacts{
            .servings_per_container = values[0],
            .serving_size_grams = values[1],
            .calories = if (values[2]) |v| @intFromFloat(v) else null,
            .total_fat_grams = values[3],
            .saturated_fat_grams = values[4],
            .trans_fat_grams = values[5],
            .polyunsaturated_fat_grams = values[6],
            .monounsaturated_fat_grams = values[7],
            .cholesterol_mg = values[8],
            .sodium_mg = values[9],
            .total_carbohydrates_g = values[10],
            .dietary_fiber_g = values[11],
            .total_sugars_g = values[12],
            .added_sugars_g = values[13],
            .protein_g = values[14],
        };

        try cases.append(allocator, .{
            .filename = try allocator.dupe(u8, filename),
            .expected = expected,
        });
    }

    return cases.toOwnedSlice(allocator);
}

test "loadTestCases parses quoted CSV rows" {
    const env = Env{ .io = std.testing.io, .allocator = std.testing.allocator };
    const tmp_path = "zig-cache-test-cases.csv";
    try std.Io.Dir.cwd().writeFile(env.io, .{ .sub_path = tmp_path, .data =
        \\"file","servings_per_container","serving_size_grams","calories","total_fat_grams","saturated_fat_grams","trans_fat_grams","polyunsaturated_fat_grams","monounsaturated_fat_grams","cholesterol_mg","sodium_mg","total_carbohydrates_g","dietary_fiber_g","total_sugars_g","added_sugars_g","protein_g"
        \\"IMG_1.png","8.0","30.0","110","1.5","0.0","0.0","0.0","0.0","0.0","350.0","20.0","1.0","0.0","0.0","3.0"
        \\
    });
    defer std.Io.Dir.cwd().deleteFile(env.io, tmp_path) catch {};

    const cases = try loadTestCases(env, tmp_path);
    defer {
        for (cases) |c| env.allocator.free(c.filename);
        env.allocator.free(cases);
    }

    try std.testing.expectEqual(@as(usize, 1), cases.len);
    try std.testing.expectEqualStrings("IMG_1.png", cases[0].filename);
    try std.testing.expectEqual(@as(?i32, 110), cases[0].expected.calories);
    try std.testing.expectEqual(@as(?f64, 8.0), cases[0].expected.servings_per_container);
    try std.testing.expectEqual(@as(?f64, 20.0), cases[0].expected.total_carbohydrates_g);
}

test "fieldMatches and eql" {
    const a = ParsedNutritionFacts{ .calories = 100, .protein_g = 5.0 };
    const b = ParsedNutritionFacts{ .calories = 100, .protein_g = 5.0 };
    const c = ParsedNutritionFacts{ .calories = 101, .protein_g = 5.0 };

    try std.testing.expect(a.eql(b));
    try std.testing.expect(!a.eql(c));

    const matches = a.fieldMatches(c);
    try std.testing.expect(!matches[2]); // calories differs
    try std.testing.expect(matches[14]); // protein_g matches
}

test "FieldScore percent" {
    var score = FieldScore{};
    var matches = [_]bool{false} ** FIELD_COUNT;
    matches[0] = true;
    matches[1] = true;
    score.record(matches);
    score.recordMiss();
    try std.testing.expectEqual(@as(usize, 2), score.totalCorrect());
    try std.testing.expectEqual(@as(usize, 2 * FIELD_COUNT), score.totalFields());
}
