import Testing
import Foundation
@testable import FoodDiary

struct DateHelpersTests {
    var calendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        return cal
    }

    func date(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 0) -> Date {
        var c = DateComponents()
        c.year = y; c.month = m; c.day = d; c.hour = h
        return calendar.date(from: c)!
    }

    @Test func localDayIsStartOfDayInGivenTimeZone() {
        let timestamp = date(2026, 6, 20, 23) // 11pm local
        #expect(DateHelpers.localDay(timestamp, calendar: calendar) == date(2026, 6, 20))
    }

    @Test func pageZeroCoversLast7DaysIncludingToday() {
        let now = date(2026, 6, 20, 15)
        // PAGE_DAYS - 1 + 0*PAGE_DAYS = 6 days back, start of that day
        #expect(DateHelpers.pageStart(page: 0, now: now, calendar: calendar) == date(2026, 6, 14))
    }

    @Test func pageOneCoversThePriorWeek() {
        let now = date(2026, 6, 20, 15)
        // PAGE_DAYS - 1 + 1*PAGE_DAYS = 13 days back
        #expect(DateHelpers.pageStart(page: 1, now: now, calendar: calendar) == date(2026, 6, 7))
    }

    @Test func weeklyStatsAnchorsMatchFixedOffsets() {
        let now = date(2026, 6, 20, 15)
        let anchors = DateHelpers.weeklyStatsAnchors(now: now, calendar: calendar)
        #expect(anchors.todayStart == date(2026, 6, 20))
        #expect(anchors.sevenDaysAgoStart == date(2026, 6, 13))
        #expect(anchors.fourWeeksAgoStart == date(2026, 5, 23))
    }
}
