import SwiftUI

/// Login gate (PRD §6.4): `.signedOut`/`.signingIn` show `LoginView`;
/// `.signedIn` roots a `NavigationStack` with the route enum's destinations.
/// Phase 0 content is a placeholder "Diary" screen — Phase 1 fills it in.
struct RootView: View {
    let environment: AppEnvironment
    @State private var diaryListViewModel: DiaryListViewModel

    init(environment: AppEnvironment) {
        self.environment = environment
        self._diaryListViewModel = State(initialValue: DiaryListViewModel(
            diaryRepository: environment.diaryRepository, targetsRepository: environment.targetsRepository))
    }

    var body: some View {
        Group {
            switch environment.authService.state {
            case .signedOut, .signingIn:
                LoginView(authService: environment.authService)
            case .signedIn:
                NavigationStack(path: Bindable(environment.router).path) {
                    DiaryListView(viewModel: diaryListViewModel, router: environment.router)
                        .navigationDestination(for: Route.self) { route in
                            destination(for: route)
                        }
                }
            }
        }
        .task {
            await environment.authService.restoreSession()
        }
    }

    private var currentUser: AuthenticatedUser {
        if case .signedIn(let user) = environment.authService.state {
            return user
        }
        return AuthenticatedUser()
    }

    @ViewBuilder
    private func destination(for route: Route) -> some View {
        switch route {
        case .newEntry:
            NewEntryView(
                viewModel: NewEntryViewModel(
                    diaryRepository: environment.diaryRepository,
                    suggestionsRepository: environment.suggestionsRepository,
                    searchRepository: environment.searchRepository),
                onSave: { environment.router.popToRoot() })
        case .editEntry(let id):
            EditEntryView(
                viewModel: EditEntryViewModel(entryID: id, diaryRepository: environment.diaryRepository),
                onFinish: { environment.router.popToRoot() })
        case .newItem:
            ItemFormView(
                viewModel: ItemFormViewModel(
                    itemID: nil, itemRepository: environment.nutritionItemRepository,
                    autofillClient: environment.sidecarClient),
                onSave: { environment.router.popToRoot() })
        case .itemEdit(let id):
            ItemFormView(
                viewModel: ItemFormViewModel(
                    itemID: id, itemRepository: environment.nutritionItemRepository,
                    autofillClient: environment.sidecarClient),
                onSave: { environment.router.popToRoot() })
        case .itemDetail(let id):
            ItemDetailView(
                viewModel: ItemDetailViewModel(itemID: id, itemRepository: environment.nutritionItemRepository),
                onEdit: { environment.router.push(.itemEdit(id)) })
        case .newRecipe:
            RecipeFormView(
                viewModel: RecipeFormViewModel(
                    recipeID: nil, recipeRepository: environment.recipeRepository,
                    searchRepository: environment.searchRepository),
                onSave: { environment.router.popToRoot() })
        case .recipeEdit(let id):
            RecipeFormView(
                viewModel: RecipeFormViewModel(
                    recipeID: id, recipeRepository: environment.recipeRepository,
                    searchRepository: environment.searchRepository),
                onSave: { environment.router.popToRoot() })
        case .recipeDetail(let id):
            RecipeDetailView(
                viewModel: RecipeDetailViewModel(recipeID: id, recipeRepository: environment.recipeRepository),
                onEdit: { environment.router.push(.recipeEdit(id)) })
        case .targets:
            TargetsView(
                viewModel: TargetsViewModel(targetsRepository: environment.targetsRepository),
                onSave: { environment.router.popToRoot() })
        case .profile:
            ProfileView(
                viewModel: ProfileViewModel(
                    user: currentUser, environmentConfig: environment.environmentConfig),
                authService: environment.authService,
                onEditTargets: { environment.router.push(.targets) })
        case .trends:
            TrendsView(
                viewModel: TrendsViewModel(
                    trendsRepository: environment.trendsRepository,
                    targetsRepository: environment.targetsRepository))
        default:
            PlaceholderDestinationView(route: route)
        }
    }
}

private struct PlaceholderDestinationView: View {
    let route: Route

    var body: some View {
        Text(String(describing: route))
    }
}
