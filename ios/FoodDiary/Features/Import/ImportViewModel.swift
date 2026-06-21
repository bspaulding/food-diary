import Foundation

/// Port of `web/src/ImportDiaryEntries.tsx` (PRD §11 Phase 4): parse a picked
/// CSV file into a previewable, confirmable batch of new entries.
@MainActor @Observable
final class ImportViewModel {
    private let importRepository: ImportRepository

    private(set) var previewRows: [CSV.ImportedEntry] = []
    private(set) var parseErrors: [String] = []
    private(set) var errorMessage: String?
    private(set) var didImport = false

    init(importRepository: ImportRepository) {
        self.importRepository = importRepository
    }

    func loadCsv(_ csv: String) {
        previewRows = []
        parseErrors = []
        let rows = CSV.parseCSV(csv)
        for row in rows {
            switch CSV.rowToEntry(row) {
            case .success(let entry):
                previewRows.append(entry)
            case .failure(let error):
                parseErrors.append(error.message)
            }
        }
    }

    func confirm() async {
        errorMessage = nil
        do {
            _ = try await importRepository.insertEntries(previewRows)
            didImport = true
        } catch {
            errorMessage = String(describing: error)
        }
    }
}
