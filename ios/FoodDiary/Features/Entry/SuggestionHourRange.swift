import Foundation

/// Port of `web/src/NewDiaryEntryForm.tsx`'s `startHour`/`endHour` calc (PRD §5).
enum SuggestionHourRange {
    static func aroundHour(now: Date, calendar: Calendar = Calendar(identifier: .gregorian)) -> (startHour: Int, endHour: Int) {
        var utcCalendar = calendar
        utcCalendar.timeZone = TimeZone(identifier: "UTC")!
        let hour = utcCalendar.component(.hour, from: now)
        return (max(0, hour - 1), min(23, hour + 1))
    }
}
