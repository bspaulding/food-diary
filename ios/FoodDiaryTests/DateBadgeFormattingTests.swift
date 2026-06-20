import Testing
import Foundation
@testable import FoodDiary

struct DateBadgeFormattingTests {
    func date(year: Int, month: Int, day: Int) -> Date {
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = day
        components.hour = 12
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar.date(from: components)!
    }

    @Test func dayOfMonthFormatsAsBareNumber() {
        #expect(DateBadgeFormatting.dayOfMonth(date(year: 2026, month: 6, day: 5), timeZone: TimeZone(identifier: "UTC")!) == "5")
    }

    @Test func dayOfMonthFormatsTwoDigitDayUnchanged() {
        #expect(DateBadgeFormatting.dayOfMonth(date(year: 2026, month: 6, day: 15), timeZone: TimeZone(identifier: "UTC")!) == "15")
    }

    @Test func monthAbbreviationIsUppercasedThreeLetters() {
        #expect(DateBadgeFormatting.monthAbbreviation(date(year: 2026, month: 6, day: 15), timeZone: TimeZone(identifier: "UTC")!) == "JUN")
    }
}
