import SwiftUI

/// Filled indigo pill button matching `web/src/ButtonLink.tsx`
/// (`bg-indigo-600 text-slate-50 py-2 px-3 text-lg rounded-md`).
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 17, weight: .regular))
            .foregroundStyle(Theme.badgeForeground)
            .padding(.vertical, 8)
            .padding(.horizontal, 12)
            .background(
                (configuration.isPressed ? Theme.accentPressed : Theme.accent),
                in: RoundedRectangle(cornerRadius: Theme.cornerRadius)
            )
    }
}

/// Underlined indigo text link matching the `text-indigo-600 hover:text-indigo-800
/// underline` pattern used throughout `web/src` for secondary actions.
struct LinkButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(configuration.isPressed ? Theme.accentPressed : Theme.accent)
            .underline()
    }
}

extension ButtonStyle where Self == PrimaryButtonStyle {
    static var webPrimary: PrimaryButtonStyle { PrimaryButtonStyle() }
}

extension ButtonStyle where Self == LinkButtonStyle {
    static var webLink: LinkButtonStyle { LinkButtonStyle() }
}
