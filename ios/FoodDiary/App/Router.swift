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
    case targets
    case profile
    case trends
    case exportEntries
    case importEntries
}

@Observable @MainActor
final class Router {
    /// Drives the iPhone `NavigationStack`. Unchanged from Phase 0/1: `push`
    /// appends, `popToRoot` clears. The stack's own back-swipe/back-button
    /// gestures also mutate this directly via the two-way `Bindable` binding;
    /// `didSet` reconciles `routeStack` (which can only shrink from the end,
    /// matching what a pop gesture does) whenever that happens outside `push`/
    /// `popToRoot`.
    var path = NavigationPath() {
        didSet {
            while routeStack.routes.count > path.count {
                routeStack.pop()
            }
        }
    }

    /// Mirrors the top of `path` for the iPad `NavigationSplitView` detail
    /// column (see `AdaptiveRootView`), which needs a concrete `Route?` rather
    /// than an opaque `NavigationPath` to bind its selection to. Kept in sync
    /// by every mutator below; `RouteStack.selection` is the pure, tested logic
    /// for "what does the detail column show right now".
    private(set) var routeStack = RouteStack()

    var selection: Route? { routeStack.selection }

    func push(_ route: Route) {
        path.append(route)
        routeStack.push(route)
    }

    func popToRoot() {
        path = NavigationPath()
        routeStack.popToRoot()
    }

    /// Pop a single destination. Not currently wired to a UI gesture directly
    /// (the iPhone stack's back-swipe goes through the `path` `didSet` above;
    /// the iPad split view clears `selection` via `popToRoot` since every route
    /// here is a single push, not a deeper stack). Kept as the symmetric
    /// counterpart to `push` for completeness and test coverage.
    func pop() {
        // `path`'s `didSet` reconciles `routeStack` to match the new (shorter)
        // count, so this doesn't need to call `routeStack.pop()` itself.
        if !path.isEmpty { path.removeLast() }
    }
}

/// Pure, tested mirror of a navigation stack's "what's on top" question.
/// Extracted from `Router` so the split-view selection logic (which route, if
/// any, the iPad detail column should render) has unit test coverage without
/// needing a live `NavigationPath`/SwiftUI environment.
struct RouteStack: Equatable {
    private(set) var routes: [Route] = []

    var selection: Route? { routes.last }

    mutating func push(_ route: Route) {
        routes.append(route)
    }

    mutating func pop() {
        if !routes.isEmpty { routes.removeLast() }
    }

    mutating func popToRoot() {
        routes = []
    }
}
