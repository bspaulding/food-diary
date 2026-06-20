import Foundation

/// Color buckets ported from `web/src/CircleProgress.tsx`'s `arcColor` hex values
/// (`#f87171` red, `#4ade80` green, `#fbbf24` amber).
enum RingColor: Equatable, Sendable {
    case red, green, amber
}

/// Ported verbatim from `web/src/CircleProgress.tsx` for exact web/iOS parity.
enum MacroRingMath {
    static func ratio(value: Double, target: Double, max: Double?) -> Double {
        let ceiling = max ?? target
        return value / (ceiling == 0 ? 1 : ceiling)
    }

    static func clampedRatio(value: Double, target: Double, max: Double?) -> Double {
        min(ratio(value: value, target: target, max: max), 1)
    }

    static func color(value: Double, target: Double, max: Double?, isLimit: Bool) -> RingColor {
        if isLimit {
            return value > target ? .red : .green
        }
        if let max, value > max { return .red }
        if value >= target { return .green }
        return .amber
    }
}
