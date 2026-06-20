import Testing
@testable import FoodDiary

/// Walking-skeleton test (Phase 0 §1.2): proves the test bundle, harness, and
/// simulator destination work end to end before any feature code exists.
struct AppConfigTests {
    @Test func readsBundledScheme() {
        let config = AppConfig(bundle: .main)
        #expect(!config.bundleID.isEmpty)
    }
}
