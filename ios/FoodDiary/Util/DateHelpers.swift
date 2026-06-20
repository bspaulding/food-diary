import Foundation

/// Ported from `web/src/DiaryList.tsx`'s date-window math (`localDay`,
/// `pageStart`, the weekly-stats anchors) for web/iOS parity. `PAGE_DAYS = 7`
/// matches the web app's one-page-per-week pagination.
enum DateHelpers {
    static let pageDays = 7

    static func localDay(_ timestamp: Date, calendar: Calendar = .current) -> Date {
        calendar.startOfDay(for: timestamp)
    }

    /// Page 0 is the most recent week (today plus the previous six days);
    /// page 1 the week before, etc. (web `DiaryList.tsx:92`).
    static func pageStart(page: Int, now: Date, calendar: Calendar = .current) -> Date {
        let daysBack = pageDays - 1 + page * pageDays
        let shifted = calendar.date(byAdding: .day, value: -daysBack, to: now)!
        return calendar.startOfDay(for: shifted)
    }

    static func weeklyStatsAnchors(now: Date, calendar: Calendar = .current) -> (todayStart: Date, sevenDaysAgoStart: Date, fourWeeksAgoStart: Date) {
        let todayStart = calendar.startOfDay(for: now)
        let sevenDaysAgo = calendar.date(byAdding: .day, value: -7, to: now)!
        let fourWeeksAgo = calendar.date(byAdding: .day, value: -28, to: now)!
        return (
            todayStart: todayStart,
            sevenDaysAgoStart: calendar.startOfDay(for: sevenDaysAgo),
            fourWeeksAgoStart: calendar.startOfDay(for: fourWeeksAgo)
        )
    }
}
