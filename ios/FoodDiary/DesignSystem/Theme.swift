import SwiftUI

/// "Native base + custom accents" (PRD decision #12): HIG colors everywhere except
/// the signature ring colors, which must match `web/src/CircleProgress.tsx` exactly
/// (`#f87171` red, `#4ade80` green, `#fbbf24` amber) for cross-platform parity.
enum Theme {
    static let ringRed = Color(red: 0xf8 / 255, green: 0x71 / 255, blue: 0x71 / 255)
    static let ringGreen = Color(red: 0x4a / 255, green: 0xde / 255, blue: 0x80 / 255)
    static let ringAmber = Color(red: 0xfb / 255, green: 0xbf / 255, blue: 0x24 / 255)
    static let ringTrack = Color(.systemGray4)

    static func ringColor(_ color: RingColor) -> Color {
        switch color {
        case .red: return ringRed
        case .green: return ringGreen
        case .amber: return ringAmber
        }
    }
}
