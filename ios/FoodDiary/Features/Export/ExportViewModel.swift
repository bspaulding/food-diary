import Foundation

/// Port of `web/src/ExportDiaryEntries.tsx` (PRD §11 Phase 4): optional date
/// range, fetch entries, build CSV for the share sheet / Files exporter.
@MainActor @Observable
final class ExportViewModel {
    private let exportRepository: ExportRepository
    private let calendar: Calendar

    var useDateRange = false
    var startDate = Date()
    var endDate = Date()
    private(set) var csv: String?
    private(set) var errorMessage: String?

    init(exportRepository: ExportRepository, calendar: Calendar = .current) {
        self.exportRepository = exportRepository
        self.calendar = calendar
    }

    func export() async {
        errorMessage = nil
        csv = nil
        do {
            let entries = try await exportRepository.entries(
                from: useDateRange ? startDate : nil, to: useDateRange ? endDate : nil)
            csv = CSV.entriesToCsv(entries, calendar: calendar)
        } catch {
            errorMessage = String(describing: error)
        }
    }
}
