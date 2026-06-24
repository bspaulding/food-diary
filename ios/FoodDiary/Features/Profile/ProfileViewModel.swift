import Foundation

/// Port of `web/src/UserProfile.tsx` (PRD §4.7): user info display, link to
/// nutrition targets, debug-only backend environment switcher, and logout.
/// Also owns the on-device LLM toggle (`ios/plans/phase-6-on-device-llm.md`
/// §4) — `onDeviceModelManager` is `nil` on devices that can't run the model
/// (or in plain tests), which hides that section entirely.
@MainActor @Observable
final class ProfileViewModel {
    static let useOnDeviceLLMKey = "useOnDeviceLLM"

    private let environmentConfig: AppEnvironmentConfig
    private let userDefaults: UserDefaults
    let onDeviceModelManager: OnDeviceModelManager?
    let supportsOnDeviceLLM: Bool

    var name: String?
    var email: String?
    var picture: URL?
    private(set) var useOnDeviceLLM: Bool

    init(
        user: AuthenticatedUser, environmentConfig: AppEnvironmentConfig,
        onDeviceModelManager: OnDeviceModelManager? = nil,
        supportsOnDeviceLLM: Bool = DeviceCapability.supportsOnDeviceLLM(),
        userDefaults: UserDefaults = .standard
    ) {
        self.name = user.name
        self.email = user.email
        self.picture = user.picture
        self.environmentConfig = environmentConfig
        self.onDeviceModelManager = onDeviceModelManager
        self.supportsOnDeviceLLM = supportsOnDeviceLLM
        self.userDefaults = userDefaults
        self.useOnDeviceLLM = userDefaults.bool(forKey: Self.useOnDeviceLLMKey)
    }

    /// Toggling off takes effect immediately (`AppEnvironment.autofillClient`
    /// resolves fresh per form open, plan §8); toggling on does **not**
    /// start the download automatically — the user taps "Download model"
    /// explicitly given the size (plan §4).
    func setUseOnDeviceLLM(_ newValue: Bool) {
        useOnDeviceLLM = newValue
        userDefaults.set(newValue, forKey: Self.useOnDeviceLLMKey)
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
