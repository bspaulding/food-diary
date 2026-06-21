import AuthenticationServices
import Foundation
import Observation
import UIKit

/// Provides the key window as the presentation anchor for
/// `ASWebAuthenticationSession`.
final class AuthPresentationContext: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}

/// `@Observable` facade over the OIDC client + token store. Publishes auth state
/// to the app root (PRD §6.1, §6.5).
@Observable @MainActor
final class AuthService {
    private(set) var state: AuthState = .signedOut

    private let oidcClient: OIDCClient
    private let tokenStore: TokenStore
    private let presentationContext = AuthPresentationContext()

    init(oidcClient: OIDCClient, tokenStore: TokenStore) {
        self.oidcClient = oidcClient
        self.tokenStore = tokenStore
    }

    /// On launch: attempt a silent refresh if a refresh token exists.
    func restoreSession() async {
        guard await tokenStore.hasRefreshToken else {
            state = .signedOut
            return
        }
        do {
            _ = try await tokenStore.currentToken()
            state = .signedIn(AuthenticatedUser())
        } catch {
            await tokenStore.clear()
            state = .signedOut
        }
    }

    func login() async {
        state = .signingIn
        do {
            let response = try await oidcClient.login(presentationContext: presentationContext)
            await tokenStore.store(response)
            state = .signedIn(userInfo(from: response))
        } catch is CancellationError {
            state = .signedOut
        } catch OIDCError.cancelled {
            state = .signedOut
        } catch {
            state = .signedOut
        }
    }

    func logout() async {
        await tokenStore.clear()
        state = .signedOut
    }

    func currentToken() async throws -> String {
        do {
            return try await tokenStore.currentToken()
        } catch {
            await logout()
            throw APIError.unauthorized
        }
    }

    private func userInfo(from response: TokenResponse) -> AuthenticatedUser {
        guard let idToken = response.idToken, let claims = JWT.profileClaims(of: idToken) else {
            return AuthenticatedUser()
        }
        return AuthenticatedUser(name: claims.name, email: claims.email, picture: claims.picture)
    }
}
