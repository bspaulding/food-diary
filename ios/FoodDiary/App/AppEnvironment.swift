import Foundation
import Observation
import SwiftData
import UIKit

/// DI container (PRD §6.1, §5.1). Holds the singletons every screen needs.
/// Repositories are protocol-typed; Phase 0 leaves them unimplemented (no
/// concrete repo conforms yet) — Phase 1 wires real implementations here.
@MainActor
final class AppEnvironment {
    let config: AppConfig
    let environmentConfig: AppEnvironmentConfig
    let oidcClient: OIDCClient
    let tokenStore: TokenStore
    let authService: AuthService
    let graphQLClient: GraphQLClient
    let router: Router
    let diaryRepository: DiaryRepository
    let targetsRepository: TargetsRepository
    let searchRepository: SearchRepository
    let suggestionsRepository: SuggestionsRepository
    let nutritionItemRepository: NutritionItemRepository
    let recipeRepository: RecipeRepository
    let trendsRepository: TrendsRepository
    let exportRepository: ExportRepository
    let importRepository: ImportRepository
    let sidecarClient: SidecarClient
    let cacheContainer: ModelContainer
    let onDeviceModelManager: OnDeviceModelManager?

    private let userDefaults: UserDefaults
    private var onDeviceEngine: OnDeviceLLMEngine?
    private var memoryObserver: NSObjectProtocol?
    private var backgroundObserver: NSObjectProtocol?

    /// Re-resolved fresh per `ItemFormViewModel` construction (plan §8):
    /// picks the on-device client only when the user has opted in *and* the
    /// model has finished downloading, falling back to the sidecar otherwise.
    var autofillClient: NutritionAutofillClient {
        guard
            let onDeviceModelManager,
            userDefaults.bool(forKey: ProfileViewModel.useOnDeviceLLMKey),
            case .ready(let modelPath) = onDeviceModelManager.state
        else { return sidecarClient }

        let engine = onDeviceEngine ?? OnDeviceLLMEngine(modelPath: modelPath)
        onDeviceEngine = engine
        return OnDeviceAutofillClient(engine: engine)
    }

    init(config: AppConfig = .shared, userDefaults: UserDefaults = .standard) {
        self.userDefaults = userDefaults
        self.config = config
        self.environmentConfig = AppEnvironmentConfig()
        self.cacheContainer = CacheSchema.makeContainer()

        let oidcClient = OIDCClient(
            domain: config.auth0Domain,
            clientID: config.auth0ClientID,
            scheme: config.auth0Scheme,
            bundleID: config.bundleID
        )
        self.oidcClient = oidcClient
        self.tokenStore = TokenStore(endpoint: oidcClient)
        self.authService = AuthService(oidcClient: oidcClient, tokenStore: tokenStore)
        self.graphQLClient = GraphQLClient(
            baseURL: environmentConfig.backend.graphQLBaseURL,
            tokenProvider: authService
        )
        self.router = Router()
        let cacheContext = ModelContext(cacheContainer)
        self.diaryRepository = CachingDiaryRepository(
            wrapping: DiaryRepositoryImpl(client: graphQLClient), context: cacheContext)
        self.targetsRepository = CachingTargetsRepository(
            wrapping: TargetsRepositoryImpl(client: graphQLClient), context: cacheContext)
        self.searchRepository = SearchRepositoryImpl(client: graphQLClient)
        self.suggestionsRepository = SuggestionsRepositoryImpl(client: graphQLClient)
        self.nutritionItemRepository = CachingNutritionItemRepository(
            wrapping: NutritionItemRepositoryImpl(client: graphQLClient), context: cacheContext)
        self.recipeRepository = CachingRecipeRepository(
            wrapping: RecipeRepositoryImpl(client: graphQLClient), context: cacheContext)
        self.trendsRepository = TrendsRepositoryImpl(client: graphQLClient)
        self.exportRepository = ExportRepositoryImpl(client: graphQLClient)
        self.importRepository = ImportRepositoryImpl(client: graphQLClient)
        self.sidecarClient = SidecarClient(
            baseURL: environmentConfig.backend.graphQLBaseURL,
            tokenProvider: authService
        )
        self.onDeviceModelManager =
            DeviceCapability.supportsOnDeviceLLM() ? OnDeviceModelManager() : nil

        observeLifecycleNotifications()
    }

    deinit {
        if let memoryObserver { NotificationCenter.default.removeObserver(memoryObserver) }
        if let backgroundObserver { NotificationCenter.default.removeObserver(backgroundObserver) }
    }

    /// Unloads the resident model on memory pressure or backgrounding (plan
    /// §6) — the next `autofillClient` access transparently reloads it.
    private func observeLifecycleNotifications() {
        memoryObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.unloadOnDeviceModel() }
        }
        backgroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.unloadOnDeviceModel() }
        }
    }

    private func unloadOnDeviceModel() {
        guard let onDeviceEngine else { return }
        Task { await onDeviceEngine.unload() }
        self.onDeviceEngine = nil
    }
}
