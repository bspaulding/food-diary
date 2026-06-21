import Testing
import Foundation
@testable import FoodDiary

/// Mock `URLProtocol` so `SidecarClient` tests exercise real `URLRequest`
/// construction (headers, body) and real `URLSession` decoding without
/// touching the network. Each test installs a handler closure.
final class MockURLProtocol: URLProtocol {
    static var handler: (@Sendable (URLRequest) throws -> (HTTPURLResponse, Data))?
    static var requests: [URLRequest] = []
    static var bodies: [Data] = []

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        var capturedRequest = request
        if let bodyStream = request.httpBodyStream {
            bodyStream.open()
            var data = Data()
            let bufferSize = 4096
            let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
            defer { buffer.deallocate() }
            while bodyStream.hasBytesAvailable {
                let read = bodyStream.read(buffer, maxLength: bufferSize)
                if read <= 0 { break }
                data.append(buffer, count: read)
            }
            bodyStream.close()
            Self.bodies.append(data)
        } else if let body = request.httpBody {
            Self.bodies.append(body)
        }
        Self.requests.append(capturedRequest)
        _ = capturedRequest

        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.unknown))
            return
        }
        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}

    static func reset() {
        handler = nil
        requests = []
        bodies = []
    }
}

private func mockSession() -> URLSession {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [MockURLProtocol.self]
    return URLSession(configuration: config)
}

private func jsonResponse(_ url: URL, status: Int, json: [String: Any]) -> (HTTPURLResponse, Data) {
    let data = try! JSONSerialization.data(withJSONObject: json)
    let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
    return (response, data)
}

private struct StubTokenProvider: SidecarTokenProviding {
    let token: String
    func currentToken() async throws -> String { token }
}

private struct TestError: Error {}

/// Thread-safe mutable counter for tests that need to count `URLProtocol`
/// handler invocations (which Swift 6 treats as concurrently-executing).
private final class AttemptCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0

    func increment() -> Int {
        lock.lock()
        defer { lock.unlock() }
        count += 1
        return count
    }

    var value: Int {
        lock.lock()
        defer { lock.unlock() }
        return count
    }
}

@Suite(.serialized)
struct SidecarClientTests {
    init() { MockURLProtocol.reset() }

    // MARK: - /llm/lookup

    @Test func lookupSuccessMapsAllFields() async throws {
        MockURLProtocol.handler = { request in
            jsonResponse(request.url!, status: 200, json: [
                "item": [
                    "description": "Banana",
                    "calories": 105,
                    "total_fat_grams": 0.4,
                    "saturated_fat_grams": 0.1,
                    "trans_fat_grams": 0,
                    "polyunsaturated_fat_grams": 0.1,
                    "monounsaturated_fat_grams": 0.0,
                    "cholesterol_milligrams": 0,
                    "sodium_milligrams": 1,
                    "total_carbohydrate_grams": 27,
                    "dietary_fiber_grams": 3.1,
                    "total_sugars_grams": 14,
                    "added_sugars_grams": 0,
                    "protein_grams": 1.3,
                ],
            ])
        }
        let client = SidecarClient(
            baseURL: URL(string: "https://example.com")!,
            tokenProvider: StubTokenProvider(token: "tok123"),
            session: mockSession())

        let result = try await client.lookupNutrition(description: "banana")

        #expect(result.description == "Banana")
        #expect(result.calories == 105)
        #expect(result.totalFatGrams == 0.4)
        #expect(result.dietaryFiberGrams == 3.1)
        #expect(result.proteinGrams == 1.3)

        let request = MockURLProtocol.requests.last!
        #expect(request.url?.absoluteString == "https://example.com/llm/lookup")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer tok123")
        #expect(request.httpMethod == "POST")
    }

    @Test func lookupMissingOrNonNumericFieldsDefaultToZero() async throws {
        MockURLProtocol.handler = { request in
            jsonResponse(request.url!, status: 200, json: [
                "item": [
                    "calories": "not-a-number",
                ],
            ])
        }
        let client = SidecarClient(
            baseURL: URL(string: "https://example.com")!,
            tokenProvider: StubTokenProvider(token: "tok"),
            session: mockSession())

        let result = try await client.lookupNutrition(description: "mystery food")

        #expect(result.description == "")
        #expect(result.calories == 0)
        #expect(result.totalFatGrams == 0)
        #expect(result.proteinGrams == 0)
    }

    @Test func lookupSendsDescriptionInRequestBody() async throws {
        MockURLProtocol.handler = { request in
            jsonResponse(request.url!, status: 200, json: ["item": [:]])
        }
        let client = SidecarClient(
            baseURL: URL(string: "https://example.com")!,
            tokenProvider: StubTokenProvider(token: "tok"),
            session: mockSession())

        _ = try await client.lookupNutrition(description: "two eggs")

        let body = MockURLProtocol.bodies.last!
        let json = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(json?["description"] as? String == "two eggs")
    }

    @Test func lookupNonOKWithErrorBodyThrowsBodyMessage() async throws {
        MockURLProtocol.handler = { request in
            jsonResponse(request.url!, status: 500, json: ["error": "model unavailable"])
        }
        let client = SidecarClient(
            baseURL: URL(string: "https://example.com")!,
            tokenProvider: StubTokenProvider(token: "tok"),
            session: mockSession())

        await #expect(throws: SidecarError.self) {
            _ = try await client.lookupNutrition(description: "x")
        }
        do {
            _ = try await client.lookupNutrition(description: "x")
            Issue.record("expected throw")
        } catch let error as SidecarError {
            #expect(error.message == "model unavailable")
        }
    }

    @Test func lookupNonOKWithoutErrorBodyFallsBackToStatusText() async throws {
        MockURLProtocol.handler = { request in
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 503, httpVersion: nil,
                headerFields: [:])!
            return (response, Data("not json".utf8))
        }
        let client = SidecarClient(
            baseURL: URL(string: "https://example.com")!,
            tokenProvider: StubTokenProvider(token: "tok"),
            session: mockSession())

        do {
            _ = try await client.lookupNutrition(description: "x")
            Issue.record("expected throw")
        } catch let error as SidecarError {
            #expect(error.message.contains("503"))
        }
    }

    // MARK: - /labeller/upload

    @Test func uploadSuccessMapsAbbreviatedFieldNames() async throws {
        MockURLProtocol.handler = { request in
            jsonResponse(request.url!, status: 200, json: [
                "image": [
                    "description": "Cereal",
                    "calories": 120,
                    "total_fat_grams": 1.0,
                    "cholesterol_mg": 0,
                    "sodium_mg": 200,
                    "total_carbohydrates_g": 25,
                    "dietary_fiber_g": 2,
                    "total_sugars_g": 9,
                    "added_sugars_g": 8,
                    "protein_g": 3,
                ],
            ])
        }
        let client = SidecarClient(
            baseURL: URL(string: "https://example.com")!,
            tokenProvider: StubTokenProvider(token: "tok456"),
            session: mockSession())

        let result = try await client.uploadLabel(imageData: Data([0xFF, 0xD8]))

        #expect(result.description == "Cereal")
        #expect(result.calories == 120)
        #expect(result.totalFatGrams == 1.0)
        #expect(result.cholesterolMilligrams == 0)
        #expect(result.sodiumMilligrams == 200)
        #expect(result.totalCarbohydrateGrams == 25)
        #expect(result.dietaryFiberGrams == 2)
        #expect(result.totalSugarsGrams == 9)
        #expect(result.addedSugarsGrams == 8)
        #expect(result.proteinGrams == 3)

        let request = MockURLProtocol.requests.last!
        #expect(request.url?.absoluteString == "https://example.com/labeller/upload")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer tok456")
        #expect(request.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("multipart/form-data") == true)
    }

    @Test func uploadMissingFieldsDefaultToZero() async throws {
        MockURLProtocol.handler = { request in
            jsonResponse(request.url!, status: 200, json: ["image": [:]])
        }
        let client = SidecarClient(
            baseURL: URL(string: "https://example.com")!,
            tokenProvider: StubTokenProvider(token: "tok"),
            session: mockSession())

        let result = try await client.uploadLabel(imageData: Data([0x01]))

        #expect(result.description == "")
        #expect(result.calories == 0)
        #expect(result.proteinGrams == 0)
    }

    @Test func uploadBodyContainsMultipartImageField() async throws {
        MockURLProtocol.handler = { request in
            jsonResponse(request.url!, status: 200, json: ["image": [:]])
        }
        let client = SidecarClient(
            baseURL: URL(string: "https://example.com")!,
            tokenProvider: StubTokenProvider(token: "tok"),
            session: mockSession())

        _ = try await client.uploadLabel(imageData: Data([0xAA, 0xBB]))

        let body = MockURLProtocol.bodies.last!
        let bodyString = String(decoding: body, as: UTF8.self)
        #expect(bodyString.contains("name=\"image\""))
        #expect(bodyString.contains("capture.jpg"))
    }

    @Test func uploadNonOKThrowsUploadFailedWithStatusText() async throws {
        MockURLProtocol.handler = { request in
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 422, httpVersion: nil,
                headerFields: [:])!
            return (response, Data())
        }
        let client = SidecarClient(
            baseURL: URL(string: "https://example.com")!,
            tokenProvider: StubTokenProvider(token: "tok"),
            session: mockSession())

        do {
            _ = try await client.uploadLabel(imageData: Data([0x01]))
            Issue.record("expected throw")
        } catch let error as SidecarError {
            #expect(error.message.contains("Upload failed"))
        }
    }

    @Test func uploadRetriesUpToThreeTimesThenSucceeds() async throws {
        let attemptCount = AttemptCounter()
        MockURLProtocol.handler = { request in
            let attempt = attemptCount.increment()
            if attempt < 3 {
                let response = HTTPURLResponse(
                    url: request.url!, statusCode: 500, httpVersion: nil, headerFields: [:])!
                return (response, Data())
            }
            return jsonResponse(request.url!, status: 200, json: ["image": ["calories": 50]])
        }
        let client = SidecarClient(
            baseURL: URL(string: "https://example.com")!,
            tokenProvider: StubTokenProvider(token: "tok"),
            session: mockSession())

        let result = try await client.uploadLabel(imageData: Data([0x01]))

        #expect(result.calories == 50)
        #expect(attemptCount.value == 3)
    }

    @Test func uploadFailsAfterThreeRetries() async throws {
        let attemptCount = AttemptCounter()
        MockURLProtocol.handler = { request in
            _ = attemptCount.increment()
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 500, httpVersion: nil, headerFields: [:])!
            return (response, Data())
        }
        let client = SidecarClient(
            baseURL: URL(string: "https://example.com")!,
            tokenProvider: StubTokenProvider(token: "tok"),
            session: mockSession())

        await #expect(throws: SidecarError.self) {
            _ = try await client.uploadLabel(imageData: Data([0x01]))
        }
        #expect(attemptCount.value == 3)
    }
}
