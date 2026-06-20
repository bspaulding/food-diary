import Foundation

/// Ported from `web/src/WeeklyStatsCalculations.ts` for exact parity with the
/// web app's "Last 7 Days" / "4-Week Avg" header math.
enum WeeklyStats {
    /// Complete days between `start` and `end` (end excluded), floored, minimum 1.
    static func calculateDaysBetween(_ start: Date, _ end: Date) -> Int {
        let days = Int((end.timeIntervalSince(start) / 86_400).rounded(.down))
        return max(1, days)
    }

    /// `ceil(total / days)`.
    static func calculateDailyAverage(total: Double, days: Int) -> Int {
        Int((total / Double(days)).rounded(.up))
    }

    /// Complete days in the last 4 weeks (start-of-day to start-of-day), so
    /// the header matches the web app's rolling window exactly.
    static func calculateFourWeeksDays(now: Date, calendar: Calendar = .current) -> Int {
        let todayStart = calendar.startOfDay(for: now)
        let fourWeeksAgo = calendar.date(byAdding: .day, value: -28, to: now)!
        let fourWeeksAgoStart = calendar.startOfDay(for: fourWeeksAgo)
        return calculateDaysBetween(fourWeeksAgoStart, todayStart)
    }
}
