import SwiftUI
import UniformTypeIdentifiers

/// Port of `web/src/ImportDiaryEntries.tsx` (PRD §11 Phase 4): pick a CSV file,
/// preview parsed rows, confirm to insert.
struct ImportView: View {
    @State var viewModel: ImportViewModel
    let onFinish: () -> Void

    @State private var isPickingFile = false

    var body: some View {
        Form {
            Section {
                Button("Choose CSV File") { isPickingFile = true }
            }
            if !viewModel.parseErrors.isEmpty {
                Section("Errors") {
                    ForEach(Array(viewModel.parseErrors.enumerated()), id: \.offset) { _, message in
                        Text(message).foregroundStyle(.red)
                    }
                }
            }
            if !viewModel.previewRows.isEmpty {
                Section("\(viewModel.previewRows.count) entries to import") {
                    ForEach(Array(viewModel.previewRows.enumerated()), id: \.offset) { _, row in
                        Text(row.nutritionItem.description)
                    }
                }
                Section {
                    Button("Import") { Task { await viewModel.confirm() } }
                }
            }
            if let errorMessage = viewModel.errorMessage {
                ErrorRetryView(message: errorMessage) { Task { await viewModel.confirm() } }
            }
        }
        .navigationTitle("Import Entries")
        .fileImporter(isPresented: $isPickingFile, allowedContentTypes: [.commaSeparatedText]) { result in
            if let url = try? result.get(), let csv = try? String(contentsOf: url, encoding: .utf8) {
                viewModel.loadCsv(csv)
            }
        }
        .onChange(of: viewModel.didImport) {
            if viewModel.didImport { onFinish() }
        }
    }
}
