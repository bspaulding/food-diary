import Testing
@testable import FoodDiary

struct MacroRingMathTests {
    @Test func ratioUsesTargetWhenNoMax() {
        #expect(MacroRingMath.ratio(value: 50, target: 100, max: nil) == 0.5)
    }

    @Test func ratioUsesMaxOverTargetWhenPresent() {
        #expect(MacroRingMath.ratio(value: 50, target: 100, max: 200) == 0.25)
    }

    @Test func ratioTreatsZeroCeilingAsOne() {
        #expect(MacroRingMath.ratio(value: 3, target: 0, max: nil) == 3)
    }

    @Test func clampedRatioCapsAtOne() {
        #expect(MacroRingMath.clampedRatio(value: 150, target: 100, max: nil) == 1)
    }

    @Test func clampedRatioPassesThroughUnderOne() {
        #expect(MacroRingMath.clampedRatio(value: 25, target: 100, max: nil) == 0.25)
    }

    @Test func limitColorIsRedWhenOverTarget() {
        #expect(MacroRingMath.color(value: 30, target: 20, max: nil, isLimit: true) == .red)
    }

    @Test func limitColorIsGreenWhenAtOrUnderTarget() {
        #expect(MacroRingMath.color(value: 20, target: 20, max: nil, isLimit: true) == .green)
    }

    @Test func nonLimitColorIsRedWhenOverMax() {
        #expect(MacroRingMath.color(value: 110, target: 100, max: 105, isLimit: false) == .red)
    }

    @Test func nonLimitColorIsGreenWhenAtOrOverTarget() {
        #expect(MacroRingMath.color(value: 100, target: 100, max: 200, isLimit: false) == .green)
    }

    @Test func nonLimitColorIsAmberWhenUnderTarget() {
        #expect(MacroRingMath.color(value: 50, target: 100, max: 200, isLimit: false) == .amber)
    }
}
