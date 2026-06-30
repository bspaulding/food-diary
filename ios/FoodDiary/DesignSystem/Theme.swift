import SwiftUI

/// Web-matched design tokens: the app now mirrors the Tailwind palette used by
/// `web/src` (slate neutrals, indigo accent, amber/green/red ring colors) instead
/// of HIG system colors, so the two clients look and feel like the same product.
enum Theme {
    // Tailwind slate scale, used for backgrounds/text/borders across web/src.
    static let slate50 = Color(red: 0xf8 / 255, green: 0xfa / 255, blue: 0xfc / 255)
    static let slate100 = Color(red: 0xf1 / 255, green: 0xf5 / 255, blue: 0xf9 / 255)
    static let slate200 = Color(red: 0xe2 / 255, green: 0xe8 / 255, blue: 0xf0 / 255)
    static let slate300 = Color(red: 0xcb / 255, green: 0xd5 / 255, blue: 0xe1 / 255)
    static let slate400 = Color(red: 0x94 / 255, green: 0xa3 / 255, blue: 0xb8 / 255)
    static let slate700 = Color(red: 0x33 / 255, green: 0x41 / 255, blue: 0x55 / 255)
    static let slate800 = Color(red: 0x1e / 255, green: 0x29 / 255, blue: 0x3b / 255)

    // Tailwind indigo scale, the web app's link/button accent.
    static let indigo600 = Color(red: 0x4f / 255, green: 0x46 / 255, blue: 0xe5 / 255)
    static let indigo700 = Color(red: 0x43 / 255, green: 0x38 / 255, blue: 0xca / 255)
    static let indigo800 = Color(red: 0x37 / 255, green: 0x30 / 255, blue: 0xa3 / 255)

    static let red600 = Color(red: 0xdc / 255, green: 0x26 / 255, blue: 0x26 / 255)

    // Trends chart line colors, matched to web/src/Trends.tsx's inline hexes.
    static let chartBlue = Color(red: 0x3b / 255, green: 0x82 / 255, blue: 0xf6 / 255)
    static let chartGreen = Color(red: 0x10 / 255, green: 0xb9 / 255, blue: 0x81 / 255)
    static let chartRed = Color(red: 0xef / 255, green: 0x44 / 255, blue: 0x44 / 255)
    static let chartGridline = Color(red: 0xe5 / 255, green: 0xe7 / 255, blue: 0xeb / 255)

    static let background = slate50
    static let surface = slate50
    static let textPrimary = slate800
    static let textSecondary = slate700
    static let textMuted = slate400
    static let border = slate200
    static let accent = indigo600
    static let accentPressed = indigo800
    static let badgeBackground = slate400
    static let badgeForeground = slate50

    static let cornerRadius: CGFloat = 6

    static let ringRed = Color(red: 0xf8 / 255, green: 0x71 / 255, blue: 0x71 / 255)
    static let ringGreen = Color(red: 0x4a / 255, green: 0xde / 255, blue: 0x80 / 255)
    static let ringAmber = Color(red: 0xfb / 255, green: 0xbf / 255, blue: 0x24 / 255)
    static let ringTrack = slate200

    static func ringColor(_ color: RingColor) -> Color {
        switch color {
        case .red: return ringRed
        case .green: return ringGreen
        case .amber: return ringAmber
        }
    }
}
