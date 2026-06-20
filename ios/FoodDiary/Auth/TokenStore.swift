import Foundation

enum TokenStoreError: Error {
    case noRefreshToken
}

/// Holds the in-memory access token + expiry, reads/writes the refresh token in
/// the Keychain, and coalesces concurrent refreshes so N callers hitting an
/// expired token trigger exactly one `/oauth/token` request (PRD §6.5 item 4 —
/// the marquee auth test).
actor TokenStore {
    private let endpoint: TokenEndpoint
    private let keychain: KeychainStoring
    private let refreshSkew: TimeInterval

    private var accessToken: String?
    private var expiry: Date?
    private var refreshTask: Task<String, Error>?

    init(endpoint: TokenEndpoint, keychain: KeychainStoring = Keychain(), refreshSkew: TimeInterval = 60) {
        self.endpoint = endpoint
        self.keychain = keychain
        self.refreshSkew = refreshSkew
    }

    func store(_ response: TokenResponse) {
        accessToken = response.accessToken
        expiry = JWT.expiry(of: response.accessToken) ?? expiryFromExpiresIn(response.expiresIn)
        if let refreshToken = response.refreshToken {
            keychain.set(refreshToken)
        }
    }

    func clear() {
        accessToken = nil
        expiry = nil
        refreshTask = nil
        keychain.delete()
    }

    var hasRefreshToken: Bool {
        keychain.get() != nil
    }

    /// Returns a valid access token, refreshing first if expired or within the
    /// skew window. Concurrent callers await the same in-flight refresh task.
    func currentToken() async throws -> String {
        if let accessToken, let expiry, expiry.timeIntervalSinceNow > refreshSkew {
            return accessToken
        }

        if let refreshTask {
            return try await refreshTask.value
        }

        let task = Task { try await performRefresh() }
        refreshTask = task
        defer { refreshTask = nil }
        return try await task.value
    }

    private func performRefresh() async throws -> String {
        guard let refreshToken = keychain.get() else {
            throw TokenStoreError.noRefreshToken
        }
        let response = try await endpoint.refresh(refreshToken: refreshToken)
        store(response)
        guard let accessToken else { throw TokenStoreError.noRefreshToken }
        return accessToken
    }

    private func expiryFromExpiresIn(_ expiresIn: Int?) -> Date? {
        guard let expiresIn else { return nil }
        return Date().addingTimeInterval(TimeInterval(expiresIn))
    }
}
