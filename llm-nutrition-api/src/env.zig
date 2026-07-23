const std = @import("std");

/// Bundles the two values nearly every I/O-touching function in this
/// project needs: the `std.Io` execution-model handle Zig 0.16 threads
/// through blocking/networked calls (HTTP, file reads, sleeps, clocks), and
/// the allocator backing that call. Passed by value everywhere instead of
/// as two separate parameters -- both fields are cheap to copy.
pub const Env = struct {
    io: std.Io,
    allocator: std.mem.Allocator,
};
