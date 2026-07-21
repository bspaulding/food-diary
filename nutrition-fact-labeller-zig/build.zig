const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const lib_mod = b.addModule("nutrition_fact_labeller", .{
        .root_source_file = b.path("src/root.zig"),
        .target = target,
        .optimize = optimize,
    });

    const exe = b.addExecutable(.{
        .name = "nutrition-fact-labeller",
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    });
    exe.root_module.addImport("nutrition_fact_labeller", lib_mod);
    b.installArtifact(exe);

    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());
    if (b.args) |args| run_cmd.addArgs(args);
    const run_step = b.step("run", "Run the nutrition-fact-labeller server");
    run_step.dependOn(&run_cmd.step);

    const bench_exe = b.addExecutable(.{
        .name = "vlm_benchmark_api",
        .root_source_file = b.path("src/vlm_benchmark_api.zig"),
        .target = target,
        .optimize = optimize,
    });
    bench_exe.root_module.addImport("nutrition_fact_labeller", lib_mod);
    b.installArtifact(bench_exe);

    const run_bench_cmd = b.addRunArtifact(bench_exe);
    run_bench_cmd.step.dependOn(b.getInstallStep());
    if (b.args) |args| run_bench_cmd.addArgs(args);
    const run_bench_step = b.step("bench", "Run the OpenRouter/API VLM benchmark");
    run_bench_step.dependOn(&run_bench_cmd.step);

    const test_step = b.step("test", "Run unit tests");

    const lib_tests = b.addTest(.{
        .root_source_file = b.path("src/root.zig"),
        .target = target,
        .optimize = optimize,
    });
    test_step.dependOn(&b.addRunArtifact(lib_tests).step);

    const auth_tests = b.addTest(.{
        .root_source_file = b.path("src/auth.zig"),
        .target = target,
        .optimize = optimize,
    });
    test_step.dependOn(&b.addRunArtifact(auth_tests).step);

    const openrouter_tests = b.addTest(.{
        .root_source_file = b.path("src/vlm/openrouter.zig"),
        .target = target,
        .optimize = optimize,
    });
    openrouter_tests.root_module.addImport("nutrition_fact_labeller", lib_mod);
    test_step.dependOn(&b.addRunArtifact(openrouter_tests).step);

    const main_tests = b.addTest(.{
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    });
    main_tests.root_module.addImport("nutrition_fact_labeller", lib_mod);
    test_step.dependOn(&b.addRunArtifact(main_tests).step);
}
