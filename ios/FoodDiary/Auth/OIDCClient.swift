import AuthenticationServices
import Foundation

struct TokenResponse: Codable, Sendable {
    var accessToken: String
    var refreshToken: String?
    var expiresIn: Int?
    var idToken: String?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
        case idToken = "id_token"
    }
}

/// Talks to Auth0's `/oauth/token` endpoint. Abstracted behind `TokenEndpoint` so
/// `TokenStore` tests can inject a counting fake (refresh-coalescing test).
protocol TokenEndpoint: Sendable {
    func exchangeCode(_ code: String, codeVerifier: String) async throws -> TokenResponse
    func refresh(refreshToken: String) async throws -> TokenResponse
}

enum OIDCError: Error {
    case cancelled
    case stateMismatch
    case missingCode
    case invalidResponse
}

/// Authorization Code + PKCE client against the existing Auth0 tenant (PRD §6.5).
/// Zero third-party deps: `AuthenticationServices`, `Foundation` only. The client
/// never validates tokens — Hasura does that — it only decodes `exp` for refresh
/// timing (see `JWT.swift`).
final class OIDCClient: NSObject, TokenEndpoint, @unchecked Sendable {
    let domain: String
    let clientID: String
    let scheme: String
    let bundleID: String

    /// The Hasura API audience. Required — without it Auth0 returns an opaque
    /// token, not a Hasura-claims JWT (PRD §6.5 item 1). Contains "://" so it is
    /// a Swift constant, never an xcconfig value.
    let audience = "https://direct-satyr-14.hasura.app/v1/graphql"

    var redirectURI: String {
        "\(scheme)://\(domain)/ios/\(bundleID)/callback"
    }

    init(domain: String, clientID: String, scheme: String, bundleID: String) {
        self.domain = domain
        self.clientID = clientID
        self.scheme = scheme
        self.bundleID = bundleID
    }

    func authorizeURL(codeChallenge: String, state: String) -> URL {
        var components = URLComponents()
        components.scheme = "https"
        components.host = domain
        components.path = "/authorize"
        components.queryItems = [
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "scope", value: "openid profile email offline_access"),
            URLQueryItem(name: "audience", value: audience),
            URLQueryItem(name: "code_challenge", value: codeChallenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: state),
        ]
        return components.url!
    }

    @MainActor
    func login(presentationContext: ASWebAuthenticationPresentationContextProviding)
        async throws -> TokenResponse
    {
        let verifier = PKCE.generateCodeVerifier()
        let challenge = PKCE.codeChallenge(for: verifier)
        let state = PKCE.generateState()
        let url = authorizeURL(codeChallenge: challenge, state: state)

        let callbackURL: URL = try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: url, callbackURLScheme: scheme
            ) { callbackURL, error in
                if let error = error as? ASWebAuthenticationSessionError,
                    error.code == .canceledLogin
                {
                    continuation.resume(throwing: OIDCError.cancelled)
                    return
                }
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let callbackURL = callbackURL else {
                    continuation.resume(throwing: OIDCError.invalidResponse)
                    return
                }
                continuation.resume(returning: callbackURL)
            }
            session.presentationContextProvider = presentationContext
            session.prefersEphemeralWebBrowserSession = false
            session.start()
        }

        let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)
        let returnedState = components?.queryItems?.first(where: { $0.name == "state" })?.value
        guard returnedState == state else { throw OIDCError.stateMismatch }
        guard let code = components?.queryItems?.first(where: { $0.name == "code" })?.value else {
            throw OIDCError.missingCode
        }

        return try await exchangeCode(code, codeVerifier: verifier)
    }

    func exchangeCode(_ code: String, codeVerifier: String) async throws -> TokenResponse {
        try await requestToken(parameters: [
            "grant_type": "authorization_code",
            "client_id": clientID,
            "code": code,
            "code_verifier": codeVerifier,
            "redirect_uri": redirectURI,
        ])
    }

    func refresh(refreshToken: String) async throws -> TokenResponse {
        try await requestToken(parameters: [
            "grant_type": "refresh_token",
            "client_id": clientID,
            "refresh_token": refreshToken,
        ])
    }

    func logoutURL(returnTo: String) -> URL {
        var components = URLComponents()
        components.scheme = "https"
        components.host = domain
        components.path = "/v2/logout"
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "returnTo", value: returnTo),
        ]
        return components.url!
    }

    private func requestToken(parameters: [String: String]) async throws -> TokenResponse {
        var request = URLRequest(url: URL(string: "https://\(domain)/oauth/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        let body =
            parameters
            .map { key, value in
                "\(key)=\(value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? value)"
            }
            .joined(separator: "&")
        request.httpBody = Data(body.utf8)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw OIDCError.invalidResponse
        }
        let decoder = JSONDecoder()
        return try decoder.decode(TokenResponse.self, from: data)
    }
}
