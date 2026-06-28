import SwiftUI

struct LoginView: View {
    let authService: AuthService

    var body: some View {
        VStack(spacing: 24) {
            Text("Food Diary")
                .font(.largeTitle.bold())
                .foregroundStyle(Theme.textPrimary)

            switch authService.state {
            case .signingIn:
                ProgressView()
            default:
                Button("Log In") {
                    Task { await authService.login() }
                }
                .buttonStyle(.webPrimary)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .webScreenStyle()
    }
}
