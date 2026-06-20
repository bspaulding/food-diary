import Testing
import Foundation
@testable import FoodDiary

struct SuggestionHourRangeTests {
    private func utcDate(hour: Int) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar.date(from: DateComponents(year: 2026, month: 6, day: 20, hour: hour))!
    }

    @Test func middayHourGivesOneHourMargin() {
        let range = SuggestionHourRange.aroundHour(now: utcDate(hour: 12))
        #expect(range.startHour == 11)
        #expect(range.endHour == 13)
    }

    @Test func midnightClampsStartHourToZero() {
        let range = SuggestionHourRange.aroundHour(now: utcDate(hour: 0))
        #expect(range.startHour == 0)
        #expect(range.endHour == 1)
    }

    @Test func lateNightClampsEndHourTo23() {
        let range = SuggestionHourRange.aroundHour(now: utcDate(hour: 23))
        #expect(range.startHour == 22)
        #expect(range.endHour == 23)
    }
}
