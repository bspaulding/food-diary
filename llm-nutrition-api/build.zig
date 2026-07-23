const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const lib_mod = b.addModule("llm_nutrition_api", .{
        .root_source_file = b.path("src/root.zig"),
        .target = target,
        .optimize = optimize,
    });

    const exe_mod = b.createModule(.{
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
        // Debug info is left in for Debug builds (useful locally); release
        // builds strip it since it otherwise dominates binary size (in one
        // measurement, stripping cut a ReleaseFast binary from ~8.5MB to
        // ~1.4MB) and isn't useful in a shipped container image.
        .strip = optimize != .Debug,
        .imports = &.{
            .{ .name = "llm_nutrition_api", .module = lib_mod },
        },
    });
    const exe = b.addExecutable(.{
        .name = "llm-nutrition-api",
        .root_module = exe_mod,
    });
    b.installArtifact(exe);

    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());
    if (b.args) |args| run_cmd.addArgs(args);
    const run_step = b.step("run", "Run the llm-nutrition-api server");
    run_step.dependOn(&run_cmd.step);

    const bench_mod = b.createModule(.{
        .root_source_file = b.path("src/vlm_benchmark_api.zig"),
        .target = target,
        .optimize = optimize,
        .strip = optimize != .Debug,
        .imports = &.{
            .{ .name = "llm_nutrition_api", .module = lib_mod },
        },
    });
    const bench_exe = b.addExecutable(.{
        .name = "vlm_benchmark_api",
        .root_module = bench_mod,
    });
    b.installArtifact(bench_exe);

    const run_bench_cmd = b.addRunArtifact(bench_exe);
    run_bench_cmd.step.dependOn(b.getInstallStep());
    if (b.args) |args| run_bench_cmd.addArgs(args);
    const run_bench_step = b.step("bench", "Run the OpenRouter/API VLM benchmark");
    run_bench_step.dependOn(&run_bench_cmd.step);

    const test_step = b.step("test", "Run unit tests");

    const lib_tests = b.addTest(.{ .root_module = lib_mod });
    test_step.dependOn(&b.addRunArtifact(lib_tests).step);

    const vlm_mod = b.createModule(.{
        .root_source_file = b.path("src/vlm.zig"),
        .target = target,
        .optimize = optimize,
    });
    const vlm_tests = b.addTest(.{ .root_module = vlm_mod });
    test_step.dependOn(&b.addRunArtifact(vlm_tests).step);

    const auth_mod = b.createModule(.{
        .root_source_file = b.path("src/auth.zig"),
        .target = target,
        .optimize = optimize,
        .imports = &.{
            .{ .name = "llm_nutrition_api", .module = lib_mod },
        },
    });
    const auth_tests = b.addTest(.{ .root_module = auth_mod });
    test_step.dependOn(&b.addRunArtifact(auth_tests).step);

    // openrouter.zig lives directly under src/ (not a subdirectory) so its
    // standalone test module can reach src/llm/http.zig via a plain
    // relative import without crossing a module boundary.
    const openrouter_mod = b.createModule(.{
        .root_source_file = b.path("src/openrouter.zig"),
        .target = target,
        .optimize = optimize,
        .imports = &.{
            .{ .name = "llm_nutrition_api", .module = lib_mod },
        },
    });
    const openrouter_tests = b.addTest(.{ .root_module = openrouter_mod });
    test_step.dependOn(&b.addRunArtifact(openrouter_tests).step);

    const http_mod = b.createModule(.{
        .root_source_file = b.path("src/llm/http.zig"),
        .target = target,
        .optimize = optimize,
        .imports = &.{
            .{ .name = "llm_nutrition_api", .module = lib_mod },
        },
    });
    const http_tests = b.addTest(.{ .root_module = http_mod });
    test_step.dependOn(&b.addRunArtifact(http_tests).step);

    const tools_mod = b.createModule(.{
        .root_source_file = b.path("src/llm/tools.zig"),
        .target = target,
        .optimize = optimize,
        .imports = &.{
            .{ .name = "llm_nutrition_api", .module = lib_mod },
        },
    });
    const tools_tests = b.addTest(.{ .root_module = tools_mod });
    test_step.dependOn(&b.addRunArtifact(tools_tests).step);

    const agent_mod = b.createModule(.{
        .root_source_file = b.path("src/llm/agent.zig"),
        .target = target,
        .optimize = optimize,
        .imports = &.{
            .{ .name = "llm_nutrition_api", .module = lib_mod },
        },
    });
    const agent_tests = b.addTest(.{ .root_module = agent_mod });
    test_step.dependOn(&b.addRunArtifact(agent_tests).step);

    const main_tests = b.addTest(.{ .root_module = exe_mod });
    test_step.dependOn(&b.addRunArtifact(main_tests).step);
}
