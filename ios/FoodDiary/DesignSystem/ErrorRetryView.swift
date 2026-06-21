import SwiftUI

/// Shared error-state presentation for screens with `loading`/`loaded`/`error`
/// states (PRD §4.1, §8, §11): message + a retry affordance that re-runs the
/// screen's load.
struct ErrorRetryView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Text(message).foregroundStyle(.red)
            Button("Retry", action: retry)
        }
    }
}
