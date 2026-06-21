import Testing
@testable import FoodDiary

/// `RouteStack` is the pure logic behind `Router.selection` — what the iPad
/// `NavigationSplitView` detail column should render given the push/pop
/// history (see `AdaptiveRootView`).
struct RouteStackTests {
    @Test func selectionIsNilWhenEmpty() {
        let stack = RouteStack()
        #expect(stack.selection == nil)
    }

    @Test func selectionIsTheLastPushedRoute() {
        var stack = RouteStack()
        stack.push(.newEntry)
        stack.push(.trends)
        #expect(stack.selection == .trends)
    }

    @Test func popRemovesOnlyTheTopRoute() {
        var stack = RouteStack()
        stack.push(.newEntry)
        stack.push(.trends)
        stack.pop()
        #expect(stack.selection == .newEntry)
    }

    @Test func popOnEmptyStackIsANoOp() {
        var stack = RouteStack()
        stack.pop()
        #expect(stack.selection == nil)
    }

    @Test func popToRootClearsSelection() {
        var stack = RouteStack()
        stack.push(.newEntry)
        stack.push(.trends)
        stack.popToRoot()
        #expect(stack.selection == nil)
    }
}
