import Testing
import Foundation
@testable import FoodDiary

/// Real-inference smoke evals against the actual LiteRT-LM/Gemma 4 E2B
/// engine — unlike `OnDeviceAutofillClientTests.swift` (which exercises
/// prompt/parse/retry logic against a fake), these run real inference and
/// check the result is in the right ballpark.
///
/// Opt-in only: needs the real ~2.6 GB model file and takes real wall-clock
/// time, so it's skipped unless explicitly enabled. To run locally:
///
///   ios/scripts/download-on-device-model.sh
///   RUN_ON_DEVICE_LLM_EVALS=1 xcodebuild test \
///       -project FoodDiary.xcodeproj -scheme FoodDiary \
///       -destination 'platform=iOS Simulator,name=iPhone 16' \
///       -only-testing:FoodDiaryTests/OnDeviceLLMEvalTests
///
/// Tolerances are deliberately loose — these catch "the model returned
/// garbage/zeros" regressions, not exact-value correctness (the model's
/// JSON-only instruction-following isn't guaranteed every call, plan §5/§11).
@Suite(.enabled(if: OnDeviceLLMEvalTests.isEnabled))
struct OnDeviceLLMEvalTests {
    static var isEnabled: Bool {
        ProcessInfo.processInfo.environment["RUN_ON_DEVICE_LLM_EVALS"] == "1" && modelPath != nil
    }

    /// `ios/.cache/on-device-llm/model.litertlm` by default — the same path
    /// `ios/scripts/download-on-device-model.sh` downloads to — overridable
    /// via `ON_DEVICE_LLM_MODEL_PATH` (e.g. to point at a real device's
    /// Application Support copy).
    static var modelPath: URL? {
        let path = ProcessInfo.processInfo.environment["ON_DEVICE_LLM_MODEL_PATH"] ?? defaultModelPath
        guard FileManager.default.fileExists(atPath: path) else { return nil }
        return URL(fileURLWithPath: path)
    }

    private static var defaultModelPath: String {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // FoodDiaryTests/
            .deletingLastPathComponent()  // ios/
            .appendingPathComponent(".cache/on-device-llm/model.litertlm")
            .path
    }

    /// Uses the CPU backend (rather than `OnDeviceLLMEngine`'s GPU
    /// production default) so this can run on hosted CI runners/simulators
    /// without depending on Metal-accelerated LLM inference.
    private func makeClient() -> OnDeviceAutofillClient {
        OnDeviceAutofillClient(engine: OnDeviceLLMEngine(modelPath: Self.modelPath!, computeBackend: .cpu))
    }

    // MARK: - Text lookup: canonical, well-known foods

    struct TextCase: Sendable, CustomTestStringConvertible {
        let description: String
        let calorieRange: ClosedRange<Double>
        let proteinRange: ClosedRange<Double>
        var testDescription: String { description }
    }

    static let textCases: [TextCase] = [
        TextCase(description: "one medium banana", calorieRange: 80...130, proteinRange: 0.5...2),
        TextCase(description: "one large egg", calorieRange: 55...90, proteinRange: 4...8),
        TextCase(description: "1 cup cooked white rice", calorieRange: 170...240, proteinRange: 2...7),
        TextCase(description: "1 medium apple", calorieRange: 70...130, proteinRange: 0...2),
    ]

    @Test(arguments: textCases)
    func lookupNutritionIsInRangeForCanonicalFoods(_ testCase: TextCase) async throws {
        let result = try await makeClient().lookupNutrition(description: testCase.description)

        #expect(testCase.calorieRange.contains(result.calories))
        #expect(testCase.proteinRange.contains(result.proteinGrams))
    }

    // MARK: - Label scan: real photos, ground truth from
    // `nutrition-fact-labeller/test_cases.csv` (shared fixtures, not
    // duplicated into the iOS tree)

    struct LabelCase: Sendable, CustomTestStringConvertible {
        let imageFilename: String
        let calories: Double
        let proteinGrams: Double
        var testDescription: String { imageFilename }
    }

    static let labelCases: [LabelCase] = [
        LabelCase(imageFilename: "IMG_5437_1200.png", calories: 110, proteinGrams: 3),
        LabelCase(imageFilename: "IMG_5421_1200.png", calories: 150, proteinGrams: 3),
        LabelCase(imageFilename: "IMG_5430_1200.png", calories: 250, proteinGrams: 9),
    ]

    /// Labels are printed numbers, not estimates, so tolerance is tighter
    /// than the text cases above — but still loose enough to tolerate the
    /// occasional OCR/digit misread rather than asserting exact equality.
    private static let labelToleranceFraction = 0.25

    @Test(arguments: labelCases)
    func uploadLabelIsInRangeForCanonicalLabels(_ testCase: LabelCase) async throws {
        let imageData = try Self.loadFixtureImage(testCase.imageFilename)
        let result = try await makeClient().uploadLabel(imageData: imageData)

        #expect(abs(result.calories - testCase.calories) <= testCase.calories * Self.labelToleranceFraction)
        #expect(
            abs(result.proteinGrams - testCase.proteinGrams)
                <= max(1, testCase.proteinGrams * Self.labelToleranceFraction))
    }

    private static func loadFixtureImage(_ filename: String) throws -> Data {
        let repoRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // FoodDiaryTests/
            .deletingLastPathComponent()  // ios/
            .deletingLastPathComponent()  // repo root
        let imageURL = repoRoot.appendingPathComponent("nutrition-fact-labeller/images/\(filename)")
        return try Data(contentsOf: imageURL)
    }
}
