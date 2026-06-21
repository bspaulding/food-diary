import SwiftUI

/// Port of `web/src/UserProfile.tsx` (PRD §4.7): user info, link to nutrition
/// targets, debug-only Developer section, and logout.
struct ProfileView: View {
    @State var viewModel: ProfileViewModel
    let authService: AuthService
    let onEditTargets: () -> Void
    let onExport: () -> Void
    let onImport: () -> Void

    @State private var customHost: String = ""
    @State private var customPort: String = "8080"

    var body: some View {
        Form {
            Section {
                if let picture = viewModel.picture {
                    AsyncImage(url: picture) { image in
                        image.resizable().scaledToFit()
                    } placeholder: {
                        Color.secondary.opacity(0.2)
                    }
                    .frame(width: 64, height: 64)
                    .clipShape(Circle())
                }
                Text(viewModel.name ?? "Signed in")
                    .font(.headline)
                if let email = viewModel.email {
                    Text(email).foregroundStyle(.secondary)
                }
            }

            Section {
                Button("Edit Nutrition Targets", action: onEditTargets)
            }

            Section("Data") {
                Button("Export Entries", action: onExport)
                Button("Import Entries", action: onImport)
            }

            #if DEBUG
            Section("Developer") {
                if viewModel.isUsingCustomBackend {
                    Text("Using custom backend").foregroundStyle(.orange)
                    Button("Reset to Production") { viewModel.resetToProductionBackend() }
                } else {
                    Text("Using production backend").foregroundStyle(.secondary)
                }
                TextField("LAN host", text: $customHost)
                    .keyboardType(.URL)
                TextField("Port", text: $customPort)
                    .keyboardType(.numberPad)
                Button("Use LAN Host") {
                    viewModel.setCustomBackend(host: customHost, port: Int(customPort) ?? 8080)
                }
            }
            #endif

            Section {
                Button("Log Out", role: .destructive) {
                    Task { await authService.logout() }
                }
            }
        }
        .navigationTitle("Profile")
    }
}
