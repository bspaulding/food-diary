import Foundation
import SwiftData

/// Caching decorators (Phase 5+ item 2, PRD §5/§14 mitigation for "online-only
/// on poor connectivity"). Each wraps a network-backed `*RepositoryImpl` of
/// the same protocol and adds a SwiftData read-through cache:
///
/// - Reads: return cached data immediately if present, then attempt a
///   network fetch. On success, reconcile the cache to match the network
///   response and return the fresh data. On failure, fall back to the cache
///   (no error surfaced) if cache exists; otherwise rethrow.
/// - Writes (create/update/delete): always delegate to the network first;
///   on success, invalidate the relevant cached query so the next read
///   refetches rather than showing stale data.
///
/// View models depend on the plain protocols, so substituting these in
/// `AppEnvironment` requires no other code changes.
struct CachingDiaryRepository: DiaryRepository {
    let inner: any DiaryRepository
    let context: ModelContext

    init(wrapping inner: any DiaryRepository, context: ModelContext) {
        self.inner = inner
        self.context = context
    }

    func entries(from: Date, to: Date?) async throws -> [DiaryEntry] {
        let key = CachedDiaryEntriesPage.key(from: from, to: to)
        do {
            let fresh = try await inner.entries(from: from, to: to)
            try storeEntriesPage(key: key, entries: fresh)
            return fresh
        } catch {
            if let cached = try fetchEntriesPage(key: key) {
                return cached
            }
            throw error
        }
    }

    func weeklyStats(currentWeekStart: Date, todayStart: Date, fourWeeksAgoStart: Date) async throws -> WeeklyStatsTotals {
        let key = CachedWeeklyStats.key(currentWeekStart: currentWeekStart, todayStart: todayStart, fourWeeksAgoStart: fourWeeksAgoStart)
        do {
            let fresh = try await inner.weeklyStats(
                currentWeekStart: currentWeekStart, todayStart: todayStart, fourWeeksAgoStart: fourWeeksAgoStart)
            storeWeeklyStats(key: key, stats: fresh)
            return fresh
        } catch {
            if let cached = fetchWeeklyStats(key: key) {
                return cached
            }
            throw error
        }
    }

    func entry(id: Int) async throws -> DiaryEntry {
        do {
            let fresh = try await inner.entry(id: id)
            try storeEntry(fresh)
            return fresh
        } catch {
            if let cached = try fetchEntry(id: id) {
                return cached
            }
            throw error
        }
    }

    func createEntry(_ input: NewDiaryEntryInput) async throws -> Int {
        let id = try await inner.createEntry(input)
        invalidateEntriesPages()
        return id
    }

    func updateEntry(id: Int, servings: Double, consumedAt: Date) async throws {
        try await inner.updateEntry(id: id, servings: servings, consumedAt: consumedAt)
        invalidateEntriesPages()
        try removeEntry(id: id)
    }

    func delete(entryID: Int) async throws {
        try await inner.delete(entryID: entryID)
        invalidateEntriesPages()
        try removeEntry(id: entryID)
    }

    // MARK: - Cache plumbing

    private func storeEntriesPage(key: String, entries: [DiaryEntry]) throws {
        let data = try JSONCoding.encoder.encode(entries)
        if let existing = try fetchEntriesPageModel(key: key) {
            existing.entriesJSON = data
            existing.fetchedAt = Date()
        } else {
            context.insert(CachedDiaryEntriesPage(key: key, entriesJSON: data, fetchedAt: Date()))
        }
        try context.save()
    }

    private func fetchEntriesPageModel(key: String) throws -> CachedDiaryEntriesPage? {
        let descriptor = FetchDescriptor<CachedDiaryEntriesPage>(predicate: #Predicate { $0.key == key })
        return try context.fetch(descriptor).first
    }

    private func fetchEntriesPage(key: String) throws -> [DiaryEntry]? {
        guard let model = try fetchEntriesPageModel(key: key) else { return nil }
        return try JSONCoding.decoder.decode([DiaryEntry].self, from: model.entriesJSON)
    }

    private func invalidateEntriesPages() {
        let descriptor = FetchDescriptor<CachedDiaryEntriesPage>()
        if let pages = try? context.fetch(descriptor) {
            for page in pages { context.delete(page) }
            try? context.save()
        }
    }

    private func storeWeeklyStats(key: String, stats: WeeklyStatsTotals) {
        let descriptor = FetchDescriptor<CachedWeeklyStats>(predicate: #Predicate { $0.key == key })
        if let existing = try? context.fetch(descriptor).first {
            existing.currentWeekCalories = stats.currentWeekCalories
            existing.pastFourWeeksCalories = stats.pastFourWeeksCalories
            existing.fetchedAt = Date()
        } else {
            context.insert(CachedWeeklyStats(
                key: key, currentWeekCalories: stats.currentWeekCalories,
                pastFourWeeksCalories: stats.pastFourWeeksCalories, fetchedAt: Date()))
        }
        try? context.save()
    }

    private func fetchWeeklyStats(key: String) -> WeeklyStatsTotals? {
        let descriptor = FetchDescriptor<CachedWeeklyStats>(predicate: #Predicate { $0.key == key })
        guard let model = try? context.fetch(descriptor).first else { return nil }
        return WeeklyStatsTotals(currentWeekCalories: model.currentWeekCalories, pastFourWeeksCalories: model.pastFourWeeksCalories)
    }

    private func storeEntry(_ entry: DiaryEntry) throws {
        let data = try JSONCoding.encoder.encode(entry)
        let descriptor = FetchDescriptor<CachedDiaryEntry>(predicate: #Predicate { $0.entryID == entry.id })
        if let existing = try context.fetch(descriptor).first {
            existing.entryJSON = data
            existing.fetchedAt = Date()
        } else {
            context.insert(CachedDiaryEntry(entryID: entry.id, entryJSON: data, fetchedAt: Date()))
        }
        try context.save()
    }

    private func fetchEntry(id: Int) throws -> DiaryEntry? {
        let descriptor = FetchDescriptor<CachedDiaryEntry>(predicate: #Predicate { $0.entryID == id })
        guard let model = try context.fetch(descriptor).first else { return nil }
        return try JSONCoding.decoder.decode(DiaryEntry.self, from: model.entryJSON)
    }

    private func removeEntry(id: Int) throws {
        let descriptor = FetchDescriptor<CachedDiaryEntry>(predicate: #Predicate { $0.entryID == id })
        let models = try context.fetch(descriptor)
        for model in models { context.delete(model) }
        try context.save()
    }
}

struct CachingNutritionItemRepository: NutritionItemRepository {
    let inner: any NutritionItemRepository
    let context: ModelContext

    init(wrapping inner: any NutritionItemRepository, context: ModelContext) {
        self.inner = inner
        self.context = context
    }

    func item(id: Int) async throws -> NutritionItem {
        do {
            let fresh = try await inner.item(id: id)
            try store(fresh)
            return fresh
        } catch {
            if let cached = try fetch(id: id) {
                return cached
            }
            throw error
        }
    }

    func create(_ input: NutritionItemInput) async throws -> Int {
        try await inner.create(input)
    }

    func update(id: Int, _ input: NutritionItemInput) async throws {
        try await inner.update(id: id, input)
        try remove(id: id)
    }

    private func store(_ item: NutritionItem) throws {
        let data = try JSONCoding.encoder.encode(item)
        let descriptor = FetchDescriptor<CachedNutritionItem>(predicate: #Predicate { $0.itemID == item.id })
        if let existing = try context.fetch(descriptor).first {
            existing.itemJSON = data
            existing.fetchedAt = Date()
        } else {
            context.insert(CachedNutritionItem(itemID: item.id, itemJSON: data, fetchedAt: Date()))
        }
        try context.save()
    }

    private func fetch(id: Int) throws -> NutritionItem? {
        let descriptor = FetchDescriptor<CachedNutritionItem>(predicate: #Predicate { $0.itemID == id })
        guard let model = try context.fetch(descriptor).first else { return nil }
        return try JSONCoding.decoder.decode(NutritionItem.self, from: model.itemJSON)
    }

    private func remove(id: Int) throws {
        let descriptor = FetchDescriptor<CachedNutritionItem>(predicate: #Predicate { $0.itemID == id })
        let models = try context.fetch(descriptor)
        for model in models { context.delete(model) }
        try context.save()
    }
}

struct CachingRecipeRepository: RecipeRepository {
    let inner: any RecipeRepository
    let context: ModelContext

    init(wrapping inner: any RecipeRepository, context: ModelContext) {
        self.inner = inner
        self.context = context
    }

    func recipe(id: Int) async throws -> Recipe {
        do {
            let fresh = try await inner.recipe(id: id)
            try store(fresh)
            return fresh
        } catch {
            if let cached = try fetch(id: id) {
                return cached
            }
            throw error
        }
    }

    func create(name: String, totalServings: Int, items: [RecipeItemDraft]) async throws -> Int {
        try await inner.create(name: name, totalServings: totalServings, items: items)
    }

    func update(id: Int, name: String, totalServings: Int, items: [RecipeItemDraft]) async throws {
        try await inner.update(id: id, name: name, totalServings: totalServings, items: items)
        try remove(id: id)
    }

    private func store(_ recipe: Recipe) throws {
        let data = try JSONCoding.encoder.encode(recipe)
        let descriptor = FetchDescriptor<CachedRecipe>(predicate: #Predicate { $0.recipeID == recipe.id })
        if let existing = try context.fetch(descriptor).first {
            existing.recipeJSON = data
            existing.fetchedAt = Date()
        } else {
            context.insert(CachedRecipe(recipeID: recipe.id, recipeJSON: data, fetchedAt: Date()))
        }
        try context.save()
    }

    private func fetch(id: Int) throws -> Recipe? {
        let descriptor = FetchDescriptor<CachedRecipe>(predicate: #Predicate { $0.recipeID == id })
        guard let model = try context.fetch(descriptor).first else { return nil }
        return try JSONCoding.decoder.decode(Recipe.self, from: model.recipeJSON)
    }

    private func remove(id: Int) throws {
        let descriptor = FetchDescriptor<CachedRecipe>(predicate: #Predicate { $0.recipeID == id })
        let models = try context.fetch(descriptor)
        for model in models { context.delete(model) }
        try context.save()
    }
}

struct CachingTargetsRepository: TargetsRepository {
    let inner: any TargetsRepository
    let context: ModelContext

    init(wrapping inner: any TargetsRepository, context: ModelContext) {
        self.inner = inner
        self.context = context
    }

    func targets() async throws -> NutritionTargets {
        do {
            let fresh = try await inner.targets()
            try store(fresh)
            return fresh
        } catch {
            if let cached = try fetch() {
                return cached
            }
            throw error
        }
    }

    func save(_ targets: NutritionTargets) async throws {
        try await inner.save(targets)
        try store(targets)
    }

    private func store(_ targets: NutritionTargets) throws {
        let data = try JSONCoding.encoder.encode(targets)
        let descriptor = FetchDescriptor<CachedNutritionTargets>()
        if let existing = try context.fetch(descriptor).first {
            existing.targetsJSON = data
            existing.fetchedAt = Date()
        } else {
            context.insert(CachedNutritionTargets(targetsJSON: data, fetchedAt: Date()))
        }
        try context.save()
    }

    private func fetch() throws -> NutritionTargets? {
        let descriptor = FetchDescriptor<CachedNutritionTargets>()
        guard let model = try context.fetch(descriptor).first else { return nil }
        return try JSONCoding.decoder.decode(NutritionTargets.self, from: model.targetsJSON)
    }
}
