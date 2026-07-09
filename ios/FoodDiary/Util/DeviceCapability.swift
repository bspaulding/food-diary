import Foundation

/// Whether this device has enough RAM to run the on-device Gemma 4 E2B model
/// (`ios/plans/phase-6-on-device-llm.md` §2). Injectable so the threshold is
/// unit-testable without a real device.
protocol PhysicalMemoryReporting {
    var physicalMemoryBytes: UInt64 { get }
}

struct ProcessInfoMemoryReporting: PhysicalMemoryReporting {
    var physicalMemoryBytes: UInt64 { ProcessInfo.processInfo.physicalMemory }
}

enum DeviceCapability {
    /// 6 GB — starting hypothesis (plan §2), covers iPhone 13/A15 and newer.
    /// Revisit once tested on real low/mid-tier devices.
    static let minimumPhysicalMemoryBytes: UInt64 = 6 * 1024 * 1024 * 1024

    static func supportsOnDeviceLLM(
        reporter: PhysicalMemoryReporting = ProcessInfoMemoryReporting(),
        isSimulator: Bool = isRunningOnSimulator
    ) -> Bool {
        guard !isSimulator else { return false }
        return reporter.physicalMemoryBytes >= minimumPhysicalMemoryBytes
    }

    static var isRunningOnSimulator: Bool {
        #if targetEnvironment(simulator)
        true
        #else
        false
        #endif
    }
}
