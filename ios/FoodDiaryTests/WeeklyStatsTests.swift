import Testing
import Foundation
@testable import FoodDiary

struct WeeklyStatsTests {
    var calendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        return cal
    }

    @Test func calculateDaysBetweenFloorsAndFloorsAtOne() {
        let start = Date(timeIntervalSince1970: 0)
        let end = start.addingTimeInterval(3.5 * 86_400)
        #expect(WeeklyStats.calculateDaysBetween(start, end) == 3)
        #expect(WeeklyStats.calculateDaysBetween(start, start.addingTimeInterval(3600)) == 1) // min 1
    }

    @Test func calculateDailyAverageRoundsUp() {
        #expect(WeeklyStats.calculateDailyAverage(total: 100, days: 3) == 34) // ceil(33.33)
        #expect(WeeklyStats.calculateDailyAverage(total: 0, days: 7) == 0)
    }

    @Test func calculateFourWeeksDaysMatchesFixedWindow() {
        var components = DateComponents()
        components.year = 2026; components.month = 6; components.day = 20
        components.hour = 15
        let now = calendar.date(from: components)!
        // startOfDay(now) - startOfDay(now - 4 weeks) = 28 days
        #expect(WeeklyStats.calculateFourWeeksDays(now: now, calendar: calendar) == 28)
    }
}
