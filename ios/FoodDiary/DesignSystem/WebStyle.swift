import SwiftUI

/// Strips iOS's grouped-list chrome (inset cards, system gray backgrounds) so
/// `List`/`Form` read as the flat, single-column layout `web/src` uses.
struct WebListStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .scrollContentBackground(.hidden)
            .listStyle(.plain)
            .background(Theme.background)
    }
}

/// Flat slate-50 screen background, used on non-list screens to match the
/// `bg-slate-50` body background in `web/src/App.tsx`.
struct WebScreenStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(Theme.background)
    }
}

extension View {
    func webListStyle() -> some View {
        modifier(WebListStyle())
    }

    func webScreenStyle() -> some View {
        modifier(WebScreenStyle())
    }
}
