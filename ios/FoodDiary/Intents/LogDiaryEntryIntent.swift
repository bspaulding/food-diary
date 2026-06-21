import AppIntents

/// "Log <item>" Shortcuts/Siri quick action (Phase 5 Widgets/Shortcuts, PRD §5):
/// resolves `item` to a nutrition item or recipe via search and creates a
/// diary entry for it. Thin glue over `LogDiaryEntryService`, which holds the
/// testable matching/creation logic — this wrapper itself isn't unit-tested,
/// matching this codebase's convention that plain view/glue code isn't tested.
struct LogDiaryEntryIntent: AppIntent {
    static var title: LocalizedStringResource = "Log Food Entry"
    static var description = IntentDescription("Logs a food diary entry for an item or recipe by name.")

    @Parameter(title: "Item or Recipe", requestValueDialog: "What did you eat?")
    var item: String

    @Parameter(title: "Servings", default: 1)
    var servings: Double?

    static var parameterSummary: some ParameterSummary {
        Summary("Log \(\.$servings) serving(s) of \(\.$item)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let environment = AppEnvironment()
        let service = LogDiaryEntryService(
            diaryRepository: environment.diaryRepository,
            searchRepository: environment.searchRepository)
        do {
            let result = try await service.log(query: item, servings: servings)
            return .result(dialog: "Logged \(result.matchedName).")
        } catch is LogDiaryEntryService.LogError {
            throw $item.needsValueError("I couldn't find \"\(item)\". Try a different name.")
        }
    }
}

/// Registers the intent as a Siri/Shortcuts suggestion (App Shortcuts surface
/// it in the Shortcuts app and Spotlight without the user authoring one).
struct FoodDiaryAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: LogDiaryEntryIntent(),
            phrases: [
                "Log a food entry in \(.applicationName)",
                "Log food in \(.applicationName)",
            ],
            shortTitle: "Log Food Entry",
            systemImageName: "fork.knife"
        )
    }
}
