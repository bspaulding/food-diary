import Foundation

/// Ported from `web/src/DiaryList.tsx`'s `entriesByDay`/`compareEntriesByConsumedAt`:
/// group by local day, days descending, entries within a day ascending by `consumedAt`.
enum DiaryGrouping {
    struct DayGroup: Identifiable, Sendable {
        var day: Date
        var entries: [DiaryEntry]
        var id: Date { day }
    }

    static func groupedByDay(_ entries: [DiaryEntry], calendar: Calendar = .current) -> [DayGroup] {
        var byDay: [Date: [DiaryEntry]] = [:]
        for entry in entries {
            let day = DateHelpers.localDay(entry.consumedAt, calendar: calendar)
            byDay[day, default: []].append(entry)
        }
        return byDay
            .map { day, entries in
                DayGroup(day: day, entries: entries.sorted { $0.consumedAt < $1.consumedAt })
            }
            .sorted { $0.day > $1.day }
    }
}
