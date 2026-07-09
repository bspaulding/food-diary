import Foundation

/// On-device counterpart to `SidecarClient`, conforming to the same
/// `NutritionAutofillClient` protocol so `ItemFormViewModel`/`ItemFormView`
/// need no changes to use it (`ios/plans/phase-6-on-device-llm.md` §7) — the
/// Profile toggle just decides which implementation `AppEnvironment` hands
/// out (§8).
struct OnDeviceAutofillClient: NutritionAutofillClient {
    let engine: OnDeviceLLMInferring

    /// Steers Gemma 4 E2B to emit the same JSON shape as `/llm/lookup`'s
    /// `item` object, so `NutritionJSONMapping` (shared with `SidecarClient`)
    /// can parse either backend's output identically.
    private static let systemPrompt = """
    You are a nutrition data extraction assistant for a food diary app. \
    Given a food description, or a photo of a nutrition facts label, \
    respond with ONLY a single JSON object and nothing else — no markdown \
    code fences, no explanation. Use exactly these keys, snake_case, with \
    plain numeric values (use 0 for anything unknown or not visible):
    description, calories, total_fat_grams, saturated_fat_grams, \
    trans_fat_grams, polyunsaturated_fat_grams, monounsaturated_fat_grams, \
    cholesterol_milligrams, sodium_milligrams, total_carbohydrate_grams, \
    dietary_fiber_grams, total_sugars_grams, added_sugars_grams, protein_grams.
    """

    func lookupNutrition(description: String) async throws -> NutritionItemInput {
        try await parsedResult {
            try await engine.lookupText(systemPrompt: Self.systemPrompt, prompt: "Food: \(description)")
        }
    }

    func uploadLabel(imageData: Data) async throws -> NutritionItemInput {
        try await parsedResult {
            try await engine.lookupImage(
                imageData: imageData, systemPrompt: Self.systemPrompt,
                prompt: "Extract the nutrition facts from this label photo.")
        }
    }

    /// Retries once on unparseable output before surfacing an error —
    /// Gemma 4 E2B's JSON-only instruction-following isn't guaranteed every
    /// call (plan §5/§11).
    private func parsedResult(_ produce: () async throws -> String) async throws -> NutritionItemInput {
        let firstAttempt = try await produce()
        if let parsed = Self.parse(firstAttempt) { return parsed }

        let secondAttempt = try await produce()
        guard let parsed = Self.parse(secondAttempt) else {
            throw SidecarError(message: "On-device model didn't return valid JSON: \(secondAttempt)")
        }
        return parsed
    }

    static func parse(_ rawText: String) -> NutritionItemInput? {
        let cleaned = stripMarkdownFence(rawText)
        guard let data = cleaned.data(using: .utf8),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        return NutritionJSONMapping.parse(json)
    }

    /// Strips a leading/trailing ``` or ```json fence, in case the model
    /// ignores the "no markdown" instruction.
    private static func stripMarkdownFence(_ text: String) -> String {
        var trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasPrefix("```") else { return trimmed }
        trimmed = String(trimmed.dropFirst(3))
        if let newlineIndex = trimmed.firstIndex(of: "\n") {
            trimmed = String(trimmed[trimmed.index(after: newlineIndex)...])
        }
        if let fenceRange = trimmed.range(of: "```", options: .backwards) {
            trimmed = String(trimmed[..<fenceRange.lowerBound])
        }
        return trimmed.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
