import Testing
import Foundation
@testable import FoodDiary

@MainActor
struct ProfileViewModelTests {
    @Test func userReflectsSignedInAuthState() {
        let user = AuthenticatedUser(name: "Brad", email: "brad@example.com", picture: URL(string: "https://example.com/a.png"))
        let viewModel = ProfileViewModel(user: user, environmentConfig: AppEnvironmentConfig())

        #expect(viewModel.name == "Brad")
        #expect(viewModel.email == "brad@example.com")
        #expect(viewModel.picture == URL(string: "https://example.com/a.png"))
    }

    @Test func userFieldsAreNilWhenClaimsMissing() {
        let viewModel = ProfileViewModel(user: AuthenticatedUser(), environmentConfig: AppEnvironmentConfig())

        #expect(viewModel.name == nil)
        #expect(viewModel.email == nil)
        #expect(viewModel.picture == nil)
    }

    @Test func isUsingCustomBackendReflectsEnvironmentConfig() {
        let config = AppEnvironmentConfig()
        let viewModel = ProfileViewModel(user: AuthenticatedUser(), environmentConfig: config)

        #expect(!viewModel.isUsingCustomBackend)

        config.backend = .custom(URL(string: "http://192.168.1.50:8080")!)

        #expect(viewModel.isUsingCustomBackend)
    }

    @Test func setCustomBackendURLUpdatesEnvironmentConfig() {
        let config = AppEnvironmentConfig()
        let viewModel = ProfileViewModel(user: AuthenticatedUser(), environmentConfig: config)

        viewModel.setCustomBackend(host: "192.168.1.50", port: 8080)

        #expect(config.backend.graphQLBaseURL == URL(string: "http://192.168.1.50:8080")!)
    }

    @Test func setCustomBackendIgnoresEmptyHost() {
        let config = AppEnvironmentConfig()
        let viewModel = ProfileViewModel(user: AuthenticatedUser(), environmentConfig: config)

        viewModel.setCustomBackend(host: "  ", port: 8080)

        #expect(config.backend.graphQLBaseURL == BackendEnvironment.production.graphQLBaseURL)
    }

    @Test func resetToProductionRestoresProductionBackend() {
        let config = AppEnvironmentConfig()
        config.backend = .custom(URL(string: "http://192.168.1.50:8080")!)
        let viewModel = ProfileViewModel(user: AuthenticatedUser(), environmentConfig: config)

        viewModel.resetToProductionBackend()

        #expect(config.backend.graphQLBaseURL == BackendEnvironment.production.graphQLBaseURL)
    }

    @Test func useOnDeviceLLMDefaultsToFalseWhenNoStoredValue() {
        let defaults = UserDefaults(suiteName: #function)!
        defaults.removePersistentDomain(forName: #function)
        let viewModel = ProfileViewModel(
            user: AuthenticatedUser(), environmentConfig: AppEnvironmentConfig(), userDefaults: defaults)

        #expect(!viewModel.useOnDeviceLLM)
    }

    @Test func setUseOnDeviceLLMUpdatesValueAndPersistsToUserDefaults() {
        let defaults = UserDefaults(suiteName: #function)!
        defaults.removePersistentDomain(forName: #function)
        let viewModel = ProfileViewModel(
            user: AuthenticatedUser(), environmentConfig: AppEnvironmentConfig(), userDefaults: defaults)

        viewModel.setUseOnDeviceLLM(true)

        #expect(viewModel.useOnDeviceLLM)
        #expect(defaults.bool(forKey: ProfileViewModel.useOnDeviceLLMKey))
    }

    @Test func useOnDeviceLLMReadsExistingStoredValueOnInit() {
        let defaults = UserDefaults(suiteName: #function)!
        defaults.removePersistentDomain(forName: #function)
        defaults.set(true, forKey: ProfileViewModel.useOnDeviceLLMKey)
        let viewModel = ProfileViewModel(
            user: AuthenticatedUser(), environmentConfig: AppEnvironmentConfig(), userDefaults: defaults)

        #expect(viewModel.useOnDeviceLLM)
    }

    @Test func supportsOnDeviceLLMDefaultsToDeviceCapabilityWhenNotInjected() {
        let viewModel = ProfileViewModel(user: AuthenticatedUser(), environmentConfig: AppEnvironmentConfig())

        #expect(viewModel.supportsOnDeviceLLM == DeviceCapability.supportsOnDeviceLLM())
    }

    @Test func supportsOnDeviceLLMCanBeOverriddenForTesting() {
        let viewModel = ProfileViewModel(
            user: AuthenticatedUser(), environmentConfig: AppEnvironmentConfig(), supportsOnDeviceLLM: true)

        #expect(viewModel.supportsOnDeviceLLM)
    }

    @Test func onDeviceModelManagerIsNilByDefault() {
        let viewModel = ProfileViewModel(user: AuthenticatedUser(), environmentConfig: AppEnvironmentConfig())

        #expect(viewModel.onDeviceModelManager == nil)
    }
}
