import SwiftUI

struct LoginView: View {
    let authService: AuthService

    var body: some View {
        VStack(spacing: 24) {
            Text("Food Diary")
                .font(.largeTitle.bold())

            switch authService.state {
            case .signingIn:
                ProgressView()
            default:
                Button("Log In") {
                    Task { await authService.login() }
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding()
    }
}
