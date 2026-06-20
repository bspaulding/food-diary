import SwiftUI

/// Port of `web/src/DateBadge.tsx`. Formatting logic lives in `DateBadgeFormatting`
/// (unit-tested); this view is the presentation layer over that logic.
struct DateBadge: View {
    let date: Date

    var body: some View {
        VStack(spacing: 0) {
            Text(DateBadgeFormatting.dayOfMonth(date))
                .font(.system(size: 28, weight: .semibold))
            Text(DateBadgeFormatting.monthAbbreviation(date))
                .font(.system(size: 16, weight: .semibold))
        }
        .multilineTextAlignment(.center)
    }
}
