import SwiftUI

/// Port of `web/src/DiaryEntryEditForm.tsx` (PRD §4.3).
struct EditEntryView: View {
    @State var viewModel: EditEntryViewModel
    let onFinish: () -> Void

    var body: some View {
        Group {
            switch viewModel.state {
            case .loading:
                ProgressView()
            case .error(let message):
                Text(message).foregroundStyle(.red)
            case .loaded:
                form
            }
        }
        .navigationTitle(viewModel.entry?.nutritionItem?.description ?? viewModel.entry?.recipe?.name ?? "Entry")
        .task {
            await viewModel.load()
        }
        .onChange(of: viewModel.didSave) {
            if viewModel.didSave { onFinish() }
        }
        .onChange(of: viewModel.didDelete) {
            if viewModel.didDelete { onFinish() }
        }
    }

    private var form: some View {
        Form {
            Stepper("Servings: \(viewModel.servings.formatted())", value: $viewModel.servings, in: 0.1...50, step: 0.1)
            DatePicker("Consumed at", selection: $viewModel.consumedAt)
            Button("Save") { Task { await viewModel.save() } }
            Button("Delete", role: .destructive) { Task { await viewModel.delete() } }
        }
    }
}
