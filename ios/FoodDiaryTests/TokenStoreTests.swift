import Testing
import Foundation
@testable import FoodDiary

/// Real `Keychain` writes require a code-signing entitlement that's absent
/// from unsigned CI test runs (CODE_SIGNING_ALLOWED=NO), so unit tests use
/// this in-memory stand-in instead.
private final class InMemoryKeychain: KeychainStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var value: String?

    func set(_ value: String) {
        lock.withLock { self.value = value }
    }

    func get() -> String? {
        lock.withLock { value }
    }

    func delete() {
        lock.withLock { value = nil }
    }
}

private actor CountingTokenEndpoint: TokenEndpoint {
    private(set) var refreshCallCount = 0
    private let exp: TimeInterval

    init(exp: TimeInterval) {
        self.exp = exp
    }

    func exchangeCode(_ code: String, codeVerifier: String) async throws -> TokenResponse {
        fatalError("not used in this test")
    }

    func refresh(refreshToken: String) async throws -> TokenResponse {
        refreshCallCount += 1
        // Simulate network latency so concurrent callers overlap.
        try await Task.sleep(nanoseconds: 50_000_000)
        let header = ["alg": "HS256"]
        let payload: [String: Any] = ["exp": exp]
        let headerB64 = PKCE.base64URLEncode(try! JSONSerialization.data(withJSONObject: header))
        let payloadB64 = PKCE.base64URLEncode(try! JSONSerialization.data(withJSONObject: payload))
        return TokenResponse(
            accessToken: "\(headerB64).\(payloadB64).sig",
            refreshToken: "rotated-refresh-token",
            expiresIn: 3600
        )
    }
}

struct TokenStoreTests {
    @Test func currentTokenReturnsCachedTokenWhenNotExpired() async throws {
        let endpoint = CountingTokenEndpoint(exp: Date().addingTimeInterval(3600).timeIntervalSince1970)
        let keychain = InMemoryKeychain()
        keychain.set("seed-refresh-token")
        let store = TokenStore(endpoint: endpoint, keychain: keychain)

        let first = try await store.currentToken()
        let second = try await store.currentToken()

        #expect(first == second)
        let count = await endpoint.refreshCallCount
        #expect(count == 1)
    }

    /// The marquee auth test (PRD §6.5): N concurrent callers while expired ⇒
    /// exactly 1 token request.
    @Test func concurrentCallersCoalesceIntoOneRefresh() async throws {
        let endpoint = CountingTokenEndpoint(exp: Date().addingTimeInterval(3600).timeIntervalSince1970)
        let keychain = InMemoryKeychain()
        keychain.set("seed-refresh-token")
        let store = TokenStore(endpoint: endpoint, keychain: keychain)

        async let a = store.currentToken()
        async let b = store.currentToken()
        async let c = store.currentToken()
        async let d = store.currentToken()

        let results = try await [a, b, c, d]
        #expect(Set(results).count == 1)

        let count = await endpoint.refreshCallCount
        #expect(count == 1)
    }

    @Test func missingRefreshTokenThrows() async throws {
        let endpoint = CountingTokenEndpoint(exp: Date().addingTimeInterval(3600).timeIntervalSince1970)
        let keychain = InMemoryKeychain()
        let store = TokenStore(endpoint: endpoint, keychain: keychain)

        await #expect(throws: TokenStoreError.noRefreshToken) {
            try await store.currentToken()
        }
    }
}
