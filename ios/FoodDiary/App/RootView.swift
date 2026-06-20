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
