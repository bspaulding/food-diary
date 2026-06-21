import Foundation
import Observation
import SwiftData

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

    init(config: AppConfig = .shared) {
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
    }
}
