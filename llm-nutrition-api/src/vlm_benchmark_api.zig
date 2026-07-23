const std = @import("std");
const root = @import("llm_nutrition_api");
const openrouter = @import("openrouter.zig");

const BASELINE_PASS: usize = 9;
const BASELINE_TOTAL: usize = 33;

const Args = struct {
    model: []const u8,
    model_name: ?[]const u8 = null,
    csv: []const u8 = "test_cases.csv",
    images_dir: []const u8 = "images",
    limit: ?usize = null,
};

fn usage() void {
    std.debug.print(
        \\Benchmark an OpenRouter/OpenAI-compatible API VLM against the nutrition fact labeller test suite
        \\
        \\Usage: vlm_benchmark_api --model <model> [--model-name <name>] [--csv <path>]
        \\                         [--images-dir <dir>] [--limit <n>]
        \\
    , .{});
}

fn parseArgs(argv: []const [:0]const u8) !Args {
    var model: ?[]const u8 = null;
    var model_name: ?[]const u8 = null;
    var csv: []const u8 = "test_cases.csv";
    var images_dir: []const u8 = "images";
    var limit: ?usize = null;

    var i: usize = 1; // skip exe name
    while (i < argv.len) : (i += 1) {
        const arg = argv[i];
        if (std.mem.eql(u8, arg, "--model")) {
            i += 1;
            model = argv[i];
        } else if (std.mem.eql(u8, arg, "--model-name")) {
            i += 1;
            model_name = argv[i];
        } else if (std.mem.eql(u8, arg, "--csv")) {
            i += 1;
            csv = argv[i];
        } else if (std.mem.eql(u8, arg, "--images-dir")) {
            i += 1;
            images_dir = argv[i];
        } else if (std.mem.eql(u8, arg, "--limit")) {
            i += 1;
            limit = try std.fmt.parseInt(usize, argv[i], 10);
        } else if (std.mem.eql(u8, arg, "-h") or std.mem.eql(u8, arg, "--help")) {
            usage();
            std.process.exit(0);
        } else {
            std.log.err("unrecognized argument: {s}", .{arg});
            return error.UnrecognizedArgument;
        }
    }

    return .{
        .model = model orelse {
            usage();
            return error.MissingRequiredModel;
        },
        .model_name = model_name,
        .csv = csv,
        .images_dir = images_dir,
        .limit = limit,
    };
}

fn getEnvAny(environ: *const std.process.Environ.Map, names: []const []const u8, default: []const u8) []const u8 {
    for (names) |name| {
        if (environ.get(name)) |v| return v;
    }
    return default;
}

pub fn main(init: std.process.Init) !void {
    const env = root.Env{ .io = init.io, .allocator = init.arena.allocator() };

    const argv = try init.minimal.args.toSlice(env.allocator);
    const args = try parseArgs(argv);

    const api_key = getEnvAny(init.environ_map, &.{ "LLM_API_KEY", "OPENROUTER_API_KEY" }, "");
    if (api_key.len == 0) {
        std.log.err("Set LLM_API_KEY or OPENROUTER_API_KEY in the environment", .{});
        return error.MissingApiKey;
    }
    const base_url = getEnvAny(init.environ_map, &.{ "LLM_BASE_URL", "OPENROUTER_BASE_URL" }, root.DEFAULT_BASE_URL);

    const name = args.model_name orelse args.model;
    const config = root.LlmConfig{ .api_key = api_key, .model = args.model, .base_url = base_url };

    var stdout_buf: [4096]u8 = undefined;
    var stdout_file_writer = std.Io.File.stdout().writer(env.io, &stdout_buf);
    const stdout = &stdout_file_writer.interface;
    defer stdout.flush() catch {};

    var cases = try root.loadTestCases(env, args.csv);
    if (args.limit) |limit| {
        if (limit < cases.len) cases = cases[0..limit];
        try stdout.print("Loaded {d} test cases (--limit {d}: smoke test, not a full eval)\n", .{ cases.len, limit });
    } else {
        try stdout.print("Loaded {d} test cases\n", .{cases.len});
    }

    try stdout.print("\nUsing API backend [{s}] model={s}\n", .{ name, args.model });
    try stdout.print("Running inference on {d} images...\n", .{cases.len});

    var passing: std.ArrayList([]const u8) = .empty;
    var fail_count: usize = 0;
    var field_score = root.FieldScore{};

    for (cases) |case| {
        const image_path = try std.fs.path.join(env.allocator, &.{ args.images_dir, case.filename });
        const image_bytes = std.Io.Dir.cwd().readFileAlloc(env.io, image_path, env.allocator, .limited(50 * 1024 * 1024)) catch |err| {
            std.debug.print("  ERROR {s}: failed to read image ({s})\n", .{ case.filename, @errorName(err) });
            field_score.recordMiss();
            fail_count += 1;
            continue;
        };

        const actual = openrouter.infer(config, env, image_bytes) catch |err| {
            std.debug.print("  ERROR {s}: {s}\n", .{ case.filename, @errorName(err) });
            field_score.recordMiss();
            fail_count += 1;
            continue;
        };

        if (actual.eql(case.expected)) {
            field_score.record(actual.fieldMatches(case.expected));
            try passing.append(env.allocator, case.filename);
        } else {
            std.debug.print("  FAIL {s}\n    got:      {any}\n    expected: {any}\n", .{ case.filename, actual, case.expected });
            field_score.record(actual.fieldMatches(case.expected));
            fail_count += 1;
        }
    }

    const pass = passing.items.len;

    try stdout.print("\n{s}\n", .{"─" ** 55});
    try stdout.print("All-fields scoring (primary metric — partial credit per field):\n", .{});
    try stdout.print("{s}\n", .{"─" ** 55});
    try stdout.print("(no PaddleOCR baseline all-fields figure available: the baseline test doesn't emit per-field results in this environment)\n", .{});
    try stdout.print("\n{s}:\n", .{name});
    try stdout.flush();
    root.printFieldScore(env, field_score);
    try stdout.print("{s}\n", .{"─" ** 55});

    try stdout.print("\nWhole-record scoring (secondary — how many cases were a perfect match):\n", .{});
    try stdout.print("{s}\n", .{"─" ** 55});
    try stdout.print("{s:<32} {s:>5} {s:>5}  {s}\n", .{ "Model", "Pass", "Fail", "Score" });
    try stdout.print("{s}\n", .{"─" ** 55});
    if (args.limit != null) {
        try stdout.print("(baseline comparison skipped: --limit was set, this isn't a full run)\n", .{});
    } else {
        try stdout.print("{s:<32} {d:>5} {d:>5}  {d}/{d} (baseline)\n", .{ "PaddleOCR", BASELINE_PASS, BASELINE_TOTAL - BASELINE_PASS, BASELINE_PASS, BASELINE_TOTAL });
    }

    if (args.limit == null) {
        if (pass > BASELINE_PASS) {
            try stdout.print("{s:<32} {d:>5} {d:>5}  {d}/{d} ▲ +{d}\n", .{ name, pass, cases.len - pass, pass, cases.len, pass - BASELINE_PASS });
        } else if (pass < BASELINE_PASS) {
            try stdout.print("{s:<32} {d:>5} {d:>5}  {d}/{d} ▼ -{d}\n", .{ name, pass, cases.len - pass, pass, cases.len, BASELINE_PASS - pass });
        } else {
            try stdout.print("{s:<32} {d:>5} {d:>5}  {d}/{d} = tie\n", .{ name, pass, cases.len - pass, pass, cases.len });
        }
    } else {
        try stdout.print("{s:<32} {d:>5} {d:>5}  {d}/{d}\n", .{ name, pass, cases.len - pass, pass, cases.len });
    }
    try stdout.print("{s}\n", .{"─" ** 55});

    if (passing.items.len > 0) {
        try stdout.print("\n[{s}] passing ({d}/{d}):\n", .{ name, pass, cases.len });
        for (passing.items) |f| {
            try stdout.print("  \u{2713} {s}\n", .{f});
        }
    }
    try stdout.flush();

    if (fail_count > 0) std.process.exit(1);
}
