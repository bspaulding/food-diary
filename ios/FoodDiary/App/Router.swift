import Foundation
import Observation
import SwiftUI

/// The navigation contract consumed by every Phase 1 feature (PRD §6.4). Locked
/// here in Phase 0; destinations render placeholders until Phase 1.
enum Route: Hashable {
    case itemDetail(Int)
    case itemEdit(Int)
    case recipeDetail(Int)
    case recipeEdit(Int)
    case newEntry
    case editEntry(Int)
    case newItem
    case newRecipe
}

@Observable @MainActor
final class Router {
    var path = NavigationPath()

    func push(_ route: Route) {
        path.append(route)
    }

    func popToRoot() {
        path = NavigationPath()
    }
}
