import SwiftUI

@main
struct FoodDiaryApp: App {
    @State private var environment = AppEnvironment()

    var body: some Scene {
        WindowGroup {
            RootView(environment: environment)
        }
    }
}
