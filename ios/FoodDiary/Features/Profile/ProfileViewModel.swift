import Foundation

/// Port of `web/src/UserProfile.tsx` (PRD §4.7): user info display, link to
/// nutrition targets, debug-only backend environment switcher, and logout.
@MainActor @Observable
final class ProfileViewModel {
    private let environmentConfig: AppEnvironmentConfig

    var name: String?
    var email: String?
    var picture: URL?

    init(user: AuthenticatedUser, environmentConfig: AppEnvironmentConfig) {
        self.name = user.name
        self.email = user.email
        self.picture = user.picture
        self.environmentConfig = environmentConfig
    }

    var isUsingCustomBackend: Bool {
        switch environmentConfig.backend {
        case .production: return false
        case .custom: return true
        }
    }

    /// Sets the in-app Developer override (debug builds only). Ignores blank
    /// hosts rather than producing an unreachable backend URL.
    func setCustomBackend(host: String, port: Int) {
        let trimmed = host.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let url = URL(string: "http://\(trimmed):\(port)") else { return }
        environmentConfig.backend = .custom(url)
    }

    func resetToProductionBackend() {
        environmentConfig.backend = .production
    }
}
