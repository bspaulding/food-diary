import SwiftUI
import UIKit

@main
struct FoodDiaryApp: App {
    @State private var environment = AppEnvironment()

    init() {
        FoodDiaryApp.configureWebStyleAppearance()
    }

    var body: some Scene {
        WindowGroup {
            RootView(environment: environment)
                .tint(Theme.accent)
        }
    }

    /// Matches the flat, borderless `bg-slate-50` header in `web/src/App.tsx`:
    /// no translucent blur or shadow line under the nav/tab bars.
    private static func configureWebStyleAppearance() {
        let navAppearance = UINavigationBarAppearance()
        navAppearance.configureWithOpaqueBackground()
        navAppearance.backgroundColor = UIColor(Theme.background)
        navAppearance.shadowColor = .clear
        navAppearance.titleTextAttributes = [.foregroundColor: UIColor(Theme.textPrimary)]
        navAppearance.largeTitleTextAttributes = [.foregroundColor: UIColor(Theme.textPrimary)]
        UINavigationBar.appearance().standardAppearance = navAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = navAppearance
        UINavigationBar.appearance().compactAppearance = navAppearance

        let tabAppearance = UITabBarAppearance()
        tabAppearance.configureWithOpaqueBackground()
        tabAppearance.backgroundColor = UIColor(Theme.background)
        tabAppearance.shadowColor = .clear
        UITabBar.appearance().standardAppearance = tabAppearance
        UITabBar.appearance().scrollEdgeAppearance = tabAppearance
    }
}
