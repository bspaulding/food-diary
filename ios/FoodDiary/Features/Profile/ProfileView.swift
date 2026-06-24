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

            if viewModel.supportsOnDeviceLLM {
                Section("On-device AI") {
                    Toggle(
                        "Use on-device AI",
                        isOn: Binding(
                            get: { viewModel.useOnDeviceLLM },
                            set: { viewModel.setUseOnDeviceLLM($0) }))

                    if viewModel.useOnDeviceLLM, let manager = viewModel.onDeviceModelManager {
                        onDeviceModelControls(manager)
                    }
                }
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

    @ViewBuilder
    private func onDeviceModelControls(_ manager: OnDeviceModelManager) -> some View {
        switch manager.state {
        case .notDownloaded:
            Button("Download model (2.6 GB)") {
                Task { await manager.download() }
            }
        case .downloading(let progress):
            ProgressView(value: progress)
            Text("Downloading model…").foregroundStyle(.secondary)
        case .ready:
            Text("Model ready").foregroundStyle(.secondary)
            Button("Delete model (frees 2.6 GB)", role: .destructive) {
                manager.deleteModel()
                viewModel.setUseOnDeviceLLM(false)
            }
        case .failed(let message):
            Text("Download failed: \(message)").foregroundStyle(.red)
            Button("Retry Download") {
                Task { await manager.download() }
            }
        }
    }
}
