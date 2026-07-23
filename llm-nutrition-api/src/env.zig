const std = @import("std");

/// Bundles the values nearly every I/O-touching function in this project
/// needs: the `std.Io` execution-model handle Zig 0.16 threads through
/// blocking/networked calls (HTTP, file reads, sleeps, clocks), and the
/// allocator backing that call. Passed by value everywhere instead of as
/// separate parameters -- all fields are cheap to copy.
///
/// `request_id` is optional and defaults to `null`: it exists purely so
/// that deep call chains (agent -> tools -> http) can prefix their log
/// lines with the originating request's id for correlation under
/// concurrent load, without threading a separate parameter through every
/// signature down to them. Non-request contexts (the benchmark CLI, unit
/// tests, `root.zig`'s test-case loader) simply never set it.
pub const Env = struct {
    io: std.Io,
    allocator: std.mem.Allocator,
    request_id: ?u64 = null,
};
