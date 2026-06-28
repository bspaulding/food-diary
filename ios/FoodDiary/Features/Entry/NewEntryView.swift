import SwiftUI

/// Port of `web/src/NewDiaryEntryForm.tsx` (PRD §4.3).
struct NewEntryView: View {
    @State var viewModel: NewEntryViewModel
    let onSave: () -> Void

    var body: some View {
        List {
            Picker("Mode", selection: $viewModel.mode) {
                Text("Suggestions").tag(NewEntryViewModel.Mode.suggestions)
                Text("Search").tag(NewEntryViewModel.Mode.search)
            }
            .pickerStyle(.segmented)

            switch viewModel.mode {
            case .suggestions:
                suggestionsContent
            case .search:
                searchContent
            }
        }
        .webListStyle()
        .navigationTitle("Add Entry")
        .task {
            await viewModel.loadSuggestions()
        }
    }

    @ViewBuilder
    private var suggestionsContent: some View {
        if !viewModel.aroundHourSuggestions.isEmpty {
            Section("Logged at this time of day") {
                ForEach(viewModel.aroundHourSuggestions) { suggestion in
                    loggableRow(kind: suggestion.kind, id: suggestion.id, name: suggestion.name)
                }
            }
        }
        if !viewModel.recentSuggestions.isEmpty {
            Section("Recently logged") {
                ForEach(viewModel.recentSuggestions) { suggestion in
                    loggableRow(kind: suggestion.kind, id: suggestion.id, name: suggestion.name)
                }
            }
        }
        if !viewModel.mostLoggedSuggestions.isEmpty {
            Section("Most logged") {
                ForEach(viewModel.mostLoggedSuggestions) { suggestion in
                    loggableRow(kind: suggestion.kind, id: suggestion.id, name: suggestion.name)
                }
            }
        }
        if viewModel.hasNoSuggestions {
            Text("No suggestions available").foregroundStyle(Theme.textMuted)
        }
    }

    @ViewBuilder
    private var searchContent: some View {
        Section {
            TextField("Search", text: $viewModel.searchQuery)
                .onChange(of: viewModel.searchQuery) {
                    Task { await viewModel.search() }
                }
        }
        Section {
            ForEach(viewModel.searchResults) { result in
                loggableRow(kind: result.kind, id: result.id, name: result.name)
            }
        }
    }

    private func loggableRow(kind: SearchResult.Kind, id: Int, name: String) -> some View {
        LoggableItemRow(kind: kind, id: id, name: name, viewModel: viewModel, onSave: onSave)
    }
}

private struct LoggableItemRow: View {
    let kind: SearchResult.Kind
    let id: Int
    let name: String
    let viewModel: NewEntryViewModel
    let onSave: () -> Void

    @State private var isExpanded = false
    @State private var servings: Double = 1
    @State private var consumedAt = Date()
    @State private var isSaving = false

    var body: some View {
        VStack(alignment: .leading) {
            Button {
                isExpanded.toggle()
            } label: {
                HStack {
                    Text("⊕")
                        .font(.title2)
                        .foregroundStyle(Theme.accent)
                        .rotationEffect(.degrees(isExpanded ? 45 : 0))
                    Text(name).foregroundStyle(Theme.textPrimary)
                    if kind == .recipe {
                        Text("RECIPE")
                            .font(.caption2)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(Theme.badgeBackground, in: RoundedRectangle(cornerRadius: 4))
                            .foregroundStyle(Theme.badgeForeground)
                    }
                }
            }
            if isExpanded {
                Stepper("Servings: \(servings.formatted())", value: $servings, in: 0.1...50, step: 0.1)
                DatePicker("Consumed at", selection: $consumedAt)
                if let saveError = viewModel.saveError {
                    Text(saveError).foregroundStyle(Theme.red600)
                }
                Button(isSaving ? "Saving..." : "Save") {
                    Task { await save() }
                }
                .buttonStyle(.webPrimary)
                .disabled(isSaving)
            }
        }
    }

    private func save() async {
        isSaving = true
        await viewModel.save(kind: kind, id: id, servings: servings, consumedAt: consumedAt)
        isSaving = false
        if viewModel.didSave {
            isExpanded = false
            onSave()
        }
    }
}
