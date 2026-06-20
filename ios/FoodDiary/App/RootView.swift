import SwiftUI

/// Login gate (PRD §6.4): `.signedOut`/`.signingIn` show `LoginView`;
/// `.signedIn` roots a `NavigationStack` with the route enum's destinations.
/// Phase 0 content is a placeholder "Diary" screen — Phase 1 fills it in.
struct RootView: View {
    let environment: AppEnvironment

    var body: some View {
        Group {
            switch environment.authService.state {
            case .signedOut, .signingIn:
                LoginView(authService: environment.authService)
            case .signedIn:
                NavigationStack(path: Bindable(environment.router).path) {
                    PlaceholderDiaryView()
                        .navigationDestination(for: Route.self) { route in
                            PlaceholderDestinationView(route: route)
                        }
                }
            }
        }
        .task {
            await environment.authService.restoreSession()
        }
    }
}

private struct PlaceholderDiaryView: View {
    var body: some View {
        Text("Diary")
            .navigationTitle("Food Diary")
    }
}

private struct PlaceholderDestinationView: View {
    let route: Route

    var body: some View {
        Text(String(describing: route))
    }
}
