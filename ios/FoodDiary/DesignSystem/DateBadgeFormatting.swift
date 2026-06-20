import Foundation

/// Ported from `web/src/DateBadge.tsx`'s `Intl.DateTimeFormat` day/month formatters.
enum DateBadgeFormatting {
    static func dayOfMonth(_ date: Date, timeZone: TimeZone = .current) -> String {
        formatter(.day, timeZone: timeZone).string(from: date)
    }

    static func monthAbbreviation(_ date: Date, timeZone: TimeZone = .current) -> String {
        formatter(.month, timeZone: timeZone).string(from: date).uppercased()
    }

    private enum Field { case day, month }

    private static func formatter(_ field: Field, timeZone: TimeZone) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.timeZone = timeZone
        switch field {
        case .day: formatter.dateFormat = "d"
        case .month: formatter.dateFormat = "MMM"
        }
        return formatter
    }
}
