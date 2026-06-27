import Testing
import Foundation
@testable import FoodDiary

private final class FakeOnDeviceLLMInferring: OnDeviceLLMInferring, @unchecked Sendable {
    var textResponses: [String]
    var imageResponses: [String]
    private(set) var textCallCount = 0
    private(set) var imageCallCount = 0

    init(textResponses: [String] = [], imageResponses: [String] = []) {
        self.textResponses = textResponses
        self.imageResponses = imageResponses
    }

    func lookupText(systemPrompt: String, prompt: String) async throws -> String {
        textCallCount += 1
        return textResponses[min(textCallCount - 1, textResponses.count - 1)]
    }

    func lookupImage(imageData: Data, systemPrompt: String, prompt: String) async throws -> String {
        imageCallCount += 1
        return imageResponses[min(imageCallCount - 1, imageResponses.count - 1)]
    }
}

private let validJSON = """
{"description":"Banana","calories":105,"total_fat_grams":0.4,"saturated_fat_grams":0.1,\
"trans_fat_grams":0,"polyunsaturated_fat_grams":0.1,"monounsaturated_fat_grams":0,\
"cholesterol_milligrams":0,"sodium_milligrams":1,"total_carbohydrate_grams":27,\
"dietary_fiber_grams":3.1,"total_sugars_grams":14,"added_sugars_grams":0,"protein_grams":1.3}
"""

struct OnDeviceAutofillClientTests {
    // MARK: - parse()

    @Test func parsesPlainJSON() {
        let result = OnDeviceAutofillClient.parse(validJSON)
        #expect(result?.description == "Banana")
        #expect(result?.calories == 105)
        #expect(result?.dietaryFiberGrams == 3.1)
    }

    @Test func parsesJSONWrappedInMarkdownFence() {
        let fenced = "```json\n\(validJSON)\n```"
        let result = OnDeviceAutofillClient.parse(fenced)
        #expect(result?.description == "Banana")
        #expect(result?.calories == 105)
    }

    @Test func missingFieldsDefaultToZero() {
        let result = OnDeviceAutofillClient.parse(#"{"description":"Mystery"}"#)
        #expect(result?.description == "Mystery")
        #expect(result?.calories == 0)
        #expect(result?.proteinGrams == 0)
    }

    @Test func nonJSONReturnsNil() {
        #expect(OnDeviceAutofillClient.parse("Sure! Here's the info you asked for.") == nil)
    }

    // MARK: - lookupNutrition / uploadLabel (retry behavior)

    @Test func lookupSucceedsOnFirstValidResponse() async throws {
        let fake = FakeOnDeviceLLMInferring(textResponses: [validJSON])
        let client = OnDeviceAutofillClient(engine: fake)

        let result = try await client.lookupNutrition(description: "banana")

        #expect(result.description == "Banana")
        #expect(fake.textCallCount == 1)
    }

    @Test func lookupRetriesOnceOnUnparseableResponseThenSucceeds() async throws {
        let fake = FakeOnDeviceLLMInferring(textResponses: ["not json at all", validJSON])
        let client = OnDeviceAutofillClient(engine: fake)

        let result = try await client.lookupNutrition(description: "banana")

        #expect(result.description == "Banana")
        #expect(fake.textCallCount == 2)
    }

    @Test func lookupThrowsAfterTwoUnparseableResponses() async throws {
        let fake = FakeOnDeviceLLMInferring(textResponses: ["nope", "still nope"])
        let client = OnDeviceAutofillClient(engine: fake)

        await #expect(throws: SidecarError.self) {
            _ = try await client.lookupNutrition(description: "banana")
        }
        #expect(fake.textCallCount == 2)
    }

    @Test func uploadLabelParsesImageResponse() async throws {
        let fake = FakeOnDeviceLLMInferring(imageResponses: [validJSON])
        let client = OnDeviceAutofillClient(engine: fake)

        let result = try await client.uploadLabel(imageData: Data([0xFF, 0xD8]))

        #expect(result.calories == 105)
        #expect(fake.imageCallCount == 1)
    }
}
