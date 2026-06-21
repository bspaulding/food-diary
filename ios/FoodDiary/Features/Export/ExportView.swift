import SwiftUI
import UniformTypeIdentifiers

/// Port of `web/src/ExportDiaryEntries.tsx` (PRD §11 Phase 4): optional date
/// range, export to CSV, then the iOS share sheet / Files exporter.
struct ExportView: View {
    @State var viewModel: ExportViewModel
    @State private var isExporting = false

    var body: some View {
        Form {
            Section {
                Toggle("Limit to date range", isOn: $viewModel.useDateRange)
                if viewModel.useDateRange {
                    DatePicker("From", selection: $viewModel.startDate, displayedComponents: .date)
                    DatePicker("To", selection: $viewModel.endDate, displayedComponents: .date)
                }
            }
            Section {
                Button("Export") { Task { await viewModel.export() } }
                if let errorMessage = viewModel.errorMessage {
                    ErrorRetryView(message: errorMessage) { Task { await viewModel.export() } }
                }
            }
        }
        .navigationTitle("Export Entries")
        .fileExporter(
            isPresented: $isExporting,
            document: CSVDocument(csv: viewModel.csv ?? ""),
            contentType: .commaSeparatedText,
            defaultFilename: "food-diary-export"
        ) { _ in }
        .onChange(of: viewModel.csv) {
            if viewModel.csv != nil { isExporting = true }
        }
    }
}

struct CSVDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.commaSeparatedText] }
    var csv: String

    init(csv: String) {
        self.csv = csv
    }

    init(configuration: ReadConfiguration) throws {
        let data = configuration.file.regularFileContents ?? Data()
        csv = String(decoding: data, as: UTF8.self)
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: Data(csv.utf8))
    }
}
