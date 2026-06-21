import Testing
import SwiftUI
@testable import FoodDiary

/// Covers the part of `Router` that isn't pure-`RouteStack` logic: keeping
/// `path` (the iPhone `NavigationStack` binding) and `selection` (the iPad
/// `NavigationSplitView` detail binding) in agreement, including when `path`
/// is mutated directly (as `NavigationStack`'s own back-swipe/back-button does
/// via the two-way `Bindable` binding in `AdaptiveRootView`/`RootView`).
@MainActor
struct RouterTests {
    @Test func pushUpdatesBothPathAndSelection() {
        let router = Router()
        router.push(.trends)
        #expect(router.path.count == 1)
        #expect(router.selection == .trends)
    }

    @Test func popToRootClearsBothPathAndSelection() {
        let router = Router()
        router.push(.trends)
        router.push(.profile)
        router.popToRoot()
        #expect(router.path.isEmpty)
        #expect(router.selection == nil)
    }

    @Test func directPathMutationReconcilesSelection() {
        // Simulates NavigationStack's back-swipe, which sets `path` directly
        // rather than calling `router.pop()`.
        let router = Router()
        router.push(.trends)
        router.push(.profile)
        router.path = NavigationPath() // back-swipe to root
        #expect(router.selection == nil)
    }

    @Test func popRemovesOnlyTheTopRouteFromBothPathAndSelection() {
        let router = Router()
        router.push(.trends)
        router.push(.profile)
        router.pop()
        #expect(router.path.count == 1)
        #expect(router.selection == .trends)
    }
}
