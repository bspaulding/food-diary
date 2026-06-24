import Testing
@testable import FoodDiary

private struct StubMemoryReporting: PhysicalMemoryReporting {
    let physicalMemoryBytes: UInt64
}

struct DeviceCapabilityTests {
    @Test func belowThresholdIsIneligible() {
        let reporter = StubMemoryReporting(physicalMemoryBytes: 4 * 1024 * 1024 * 1024)
        #expect(DeviceCapability.supportsOnDeviceLLM(reporter: reporter, isSimulator: false) == false)
    }

    @Test func atThresholdIsEligible() {
        let reporter = StubMemoryReporting(physicalMemoryBytes: DeviceCapability.minimumPhysicalMemoryBytes)
        #expect(DeviceCapability.supportsOnDeviceLLM(reporter: reporter, isSimulator: false) == true)
    }

    @Test func aboveThresholdIsEligible() {
        let reporter = StubMemoryReporting(physicalMemoryBytes: 8 * 1024 * 1024 * 1024)
        #expect(DeviceCapability.supportsOnDeviceLLM(reporter: reporter, isSimulator: false) == true)
    }

    @Test func simulatorIsAlwaysIneligibleRegardlessOfMemory() {
        let reporter = StubMemoryReporting(physicalMemoryBytes: 16 * 1024 * 1024 * 1024)
        #expect(DeviceCapability.supportsOnDeviceLLM(reporter: reporter, isSimulator: true) == false)
    }
}
