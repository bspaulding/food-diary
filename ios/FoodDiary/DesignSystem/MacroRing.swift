import SwiftUI

/// Port of `web/src/CircleProgress.tsx`. Color/ratio rules live in `MacroRingMath`
/// (unit-tested); this view is the presentation layer over that logic.
struct MacroRing: View {
    let value: Double
    let target: Double
    let max: Double?
    let label: String
    let unit: String
    let isLimit: Bool

    init(value: Double, target: Double, max: Double? = nil, label: String, unit: String = "", isLimit: Bool = false) {
        self.value = value
        self.target = target
        self.max = max
        self.label = label
        self.unit = unit
        self.isLimit = isLimit
    }

    private var clampedRatio: Double {
        MacroRingMath.clampedRatio(value: value, target: target, max: max)
    }

    private var color: Color {
        Theme.ringColor(MacroRingMath.color(value: value, target: target, max: max, isLimit: isLimit))
    }

    var body: some View {
        VStack(spacing: 2) {
            ZStack {
                Circle()
                    .stroke(Theme.ringTrack, lineWidth: 6)
                Circle()
                    .trim(from: 0, to: clampedRatio)
                    .stroke(color, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text("\(Int(value.rounded()))\(unit)")
                    .font(.system(size: 16))
            }
            .frame(width: 80, height: 80)
            Text(label)
                .font(.caption)
                .textCase(.uppercase)
                .foregroundStyle(Theme.textSecondary)
        }
    }
}
