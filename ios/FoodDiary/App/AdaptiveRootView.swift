import SwiftUI

/// Branches the signed-in navigation container on horizontal size class
/// (decision #15's `NavigationStack` made adaptive — phase-5-platform-polish
/// item 1): compact width (iPhone, default) keeps the existing
/// `NavigationStack` + `Route` push/pop behavior byte-for-byte; regular width
/// (iPad, wide iPad-style windows) instead shows a two-column
/// `NavigationSplitView` with the diary list as the sidebar and the current
/// route's destination (`Router.selection`) as the detail.
///
/// `Router`'s `path`/`push`/`popToRoot` API is unchanged so every feature view
/// model and existing test is untouched — this view only decides which SwiftUI
/// container renders that same state.
struct AdaptiveRootView<Sidebar: View, Detail: View>: View {
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    let router: Router
    @ViewBuilder let sidebar: () -> Sidebar
    @ViewBuilder let destination: (Route) -> Detail

    var body: some View {
        if horizontalSizeClass == .regular {
            NavigationSplitView {
                sidebar()
            } detail: {
                if let selection = router.selection {
                    destination(selection)
                } else {
                    ContentUnavailableView(
                        "Select an item", systemImage: "fork.knife",
                        description: Text("Choose an entry, item, or recipe to see details."))
                }
            }
        } else {
            NavigationStack(path: Bindable(router).path) {
                sidebar()
                    .navigationDestination(for: Route.self) { route in
                        destination(route)
                    }
            }
        }
    }
}
