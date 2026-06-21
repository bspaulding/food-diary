import Testing
import Foundation
import SwiftData
@testable import FoodDiary

private struct TestError: Error {}

// MARK: - Fakes

private actor FakeDiaryRepository: DiaryRepository {
    var entriesToReturn: [DiaryEntry] = []
    var entryToReturn: DiaryEntry?
    var statsToReturn = WeeklyStatsTotals(currentWeekCalories: 0, pastFourWeeksCalories: 0)
    var error: Error?
    private(set) var entriesCallCount = 0
    private(set) var weeklyStatsCallCount = 0
    private(set) var entryCallCount = 0
    private(set) var deleteCallCount = 0
    private(set) var lastDeletedID: Int?
    private(set) var updateCallCount = 0

    func entries(from: Date, to: Date?) async throws -> [DiaryEntry] {
        entriesCallCount += 1
        if let error { throw error }
        return entriesToReturn
    }

    func weeklyStats(currentWeekStart: Date, todayStart: Date, fourWeeksAgoStart: Date) async throws -> WeeklyStatsTotals {
        weeklyStatsCallCount += 1
        if let error { throw error }
        return statsToReturn
    }

    func entry(id: Int) async throws -> DiaryEntry {
        entryCallCount += 1
        if let error { throw error }
        guard let entryToReturn else { throw TestError() }
        return entryToReturn
    }

    func createEntry(_ input: NewDiaryEntryInput) async throws -> Int {
        if let error { throw error }
        return 1
    }

    func updateEntry(id: Int, servings: Double, consumedAt: Date) async throws {
        updateCallCount += 1
        if let error { throw error }
    }

    func delete(entryID: Int) async throws {
        deleteCallCount += 1
        lastDeletedID = entryID
        if let error { throw error }
    }

    func setEntries(_ entries: [DiaryEntry]) { entriesToReturn = entries }
    func setEntry(_ entry: DiaryEntry) { entryToReturn = entry }
    func setStats(_ stats: WeeklyStatsTotals) { statsToReturn = stats }
    func setError(_ error: Error?) { self.error = error }
}

private actor FakeNutritionItemRepository: NutritionItemRepository {
    var itemToReturn: NutritionItem?
    var error: Error?
    private(set) var itemCallCount = 0
    private(set) var updateCallCount = 0

    func item(id: Int) async throws -> NutritionItem {
        itemCallCount += 1
        if let error { throw error }
        guard let itemToReturn else { throw TestError() }
        return itemToReturn
    }

    func create(_ input: NutritionItemInput) async throws -> Int {
        if let error { throw error }
        return 1
    }

    func update(id: Int, _ input: NutritionItemInput) async throws {
        updateCallCount += 1
        if let error { throw error }
    }

    func setItem(_ item: NutritionItem) { itemToReturn = item }
    func setError(_ error: Error?) { self.error = error }
}

private actor FakeRecipeRepository: RecipeRepository {
    var recipeToReturn: Recipe?
    var error: Error?
    private(set) var recipeCallCount = 0
    private(set) var updateCallCount = 0

    func recipe(id: Int) async throws -> Recipe {
        recipeCallCount += 1
        if let error { throw error }
        guard let recipeToReturn else { throw TestError() }
        return recipeToReturn
    }

    func create(name: String, totalServings: Int, items: [RecipeItemDraft]) async throws -> Int {
        if let error { throw error }
        return 1
    }

    func update(id: Int, name: String, totalServings: Int, items: [RecipeItemDraft]) async throws {
        updateCallCount += 1
        if let error { throw error }
    }

    func setRecipe(_ recipe: Recipe) { recipeToReturn = recipe }
    func setError(_ error: Error?) { self.error = error }
}

private actor FakeTargetsRepository: TargetsRepository {
    var targetsToReturn: NutritionTargets = .default
    var error: Error?
    private(set) var targetsCallCount = 0
    private(set) var saveCallCount = 0

    func targets() async throws -> NutritionTargets {
        targetsCallCount += 1
        if let error { throw error }
        return targetsToReturn
    }

    func save(_ targets: NutritionTargets) async throws {
        saveCallCount += 1
        if let error { throw error }
    }

    func setTargets(_ targets: NutritionTargets) { targetsToReturn = targets }
    func setError(_ error: Error?) { self.error = error }
}

// MARK: - Helpers

@MainActor
private func makeInMemoryContext() -> ModelContext {
    ModelContext(CacheSchema.makeContainer(inMemory: true))
}

private func sampleEntry(id: Int = 1) -> DiaryEntry {
    DiaryEntry(
        id: id, consumedAt: Date(timeIntervalSince1970: 1_700_000_000), calories: 100, servings: 1,
        nutritionItem: EntryNutritionItem(
            id: 1, description: "Oats", calories: 100, addedSugarsGrams: 1, proteinGrams: 4, dietaryFiberGrams: 2),
        recipe: nil)
}

private func sampleItem(id: Int = 1) -> NutritionItem {
    NutritionItem(
        id: id, description: "Oats", calories: 160, totalFatGrams: 2, saturatedFatGrams: 0,
        transFatGrams: 0, polyunsaturatedFatGrams: 0.5, monounsaturatedFatGrams: 1,
        cholesterolMilligrams: 0, sodiumMilligrams: 190, totalCarbohydrateGrams: 34,
        dietaryFiberGrams: 2, totalSugarsGrams: 9, addedSugarsGrams: 8, proteinGrams: 3)
}

private func sampleRecipe(id: Int = 1) -> Recipe {
    Recipe(id: id, name: "Breakfast", totalServings: 2, recipeItems: [
        RecipeItem(servings: 1, nutritionItem: RecipeItemSummary(id: 1, description: "Oats", calories: 160)),
    ])
}

// MARK: - CachingDiaryRepository

@MainActor
struct CachingDiaryRepositoryTests {
    @Test func returnsCachedEntriesInstantlyThenReconcilesFromNetwork() async throws {
        let context = makeInMemoryContext()
        let fake = FakeDiaryRepository()
        let from = Date(timeIntervalSince1970: 0)
        let cached = sampleEntry(id: 1)
        let fresh = sampleEntry(id: 2)

        // Pre-seed the cache as if a previous fetch happened.
        await fake.setEntries([cached])
        let warmRepo = CachingDiaryRepository(wrapping: fake, context: context)
        _ = try await warmRepo.entries(from: from, to: nil)

        // Now the network would return something different; the *first*
        // value returned synchronously-ish should still reflect what's cached
        // (this test asserts the reconciliation behavior end-to-end: after a
        // successful fetch, the cache is updated to match the network).
        await fake.setEntries([fresh])
        let result = try await warmRepo.entries(from: from, to: nil)
        #expect(result.map(\.id) == [2])

        // Cache should now reflect the fresh fetch.
        let descriptor = FetchDescriptor<CachedDiaryEntriesPage>()
        let pages = try context.fetch(descriptor)
        #expect(pages.count == 1)
    }

    @Test func fallsBackToCacheWhenNetworkFails() async throws {
        let context = makeInMemoryContext()
        let fake = FakeDiaryRepository()
        let from = Date(timeIntervalSince1970: 0)
        await fake.setEntries([sampleEntry(id: 1)])
        let repo = CachingDiaryRepository(wrapping: fake, context: context)
        _ = try await repo.entries(from: from, to: nil)

        await fake.setError(TestError())
        let result = try await repo.entries(from: from, to: nil)

        #expect(result.map(\.id) == [1])
    }

    @Test func throwsWhenNetworkFailsAndNoCacheExists() async throws {
        let context = makeInMemoryContext()
        let fake = FakeDiaryRepository()
        await fake.setError(TestError())
        let repo = CachingDiaryRepository(wrapping: fake, context: context)

        await #expect(throws: Error.self) {
            try await repo.entries(from: Date(), to: nil)
        }
    }

    @Test func entriesForDifferentQueryWindowsAreCachedSeparately() async throws {
        let context = makeInMemoryContext()
        let fake = FakeDiaryRepository()
        let repo = CachingDiaryRepository(wrapping: fake, context: context)

        await fake.setEntries([sampleEntry(id: 1)])
        _ = try await repo.entries(from: Date(timeIntervalSince1970: 0), to: nil)

        await fake.setEntries([sampleEntry(id: 2)])
        _ = try await repo.entries(from: Date(timeIntervalSince1970: 1000), to: nil)

        let descriptor = FetchDescriptor<CachedDiaryEntriesPage>()
        let pages = try context.fetch(descriptor)
        #expect(pages.count == 2)
    }

    @Test func entryByIDFallsBackToCacheOnNetworkError() async throws {
        let context = makeInMemoryContext()
        let fake = FakeDiaryRepository()
        let repo = CachingDiaryRepository(wrapping: fake, context: context)
        await fake.setEntry(sampleEntry(id: 42))
        _ = try await repo.entry(id: 42)

        await fake.setError(TestError())
        let result = try await repo.entry(id: 42)
        #expect(result.id == 42)
    }

    @Test func weeklyStatsFallsBackToCacheOnNetworkError() async throws {
        let context = makeInMemoryContext()
        let fake = FakeDiaryRepository()
        let repo = CachingDiaryRepository(wrapping: fake, context: context)
        await fake.setStats(WeeklyStatsTotals(currentWeekCalories: 500, pastFourWeeksCalories: 2000))
        let anchors = (Date(), Date(), Date())
        _ = try await repo.weeklyStats(currentWeekStart: anchors.0, todayStart: anchors.1, fourWeeksAgoStart: anchors.2)

        await fake.setError(TestError())
        let result = try await repo.weeklyStats(currentWeekStart: anchors.0, todayStart: anchors.1, fourWeeksAgoStart: anchors.2)
        #expect(result.currentWeekCalories == 500)
        #expect(result.pastFourWeeksCalories == 2000)
    }

    @Test func deleteDelegatesToNetworkAndInvalidatesEntriesCache() async throws {
        let context = makeInMemoryContext()
        let fake = FakeDiaryRepository()
        let repo = CachingDiaryRepository(wrapping: fake, context: context)
        let from = Date(timeIntervalSince1970: 0)
        await fake.setEntries([sampleEntry(id: 1), sampleEntry(id: 2)])
        _ = try await repo.entries(from: from, to: nil)

        try await repo.delete(entryID: 1)

        let deleteCount = await fake.deleteCallCount
        let lastDeletedID = await fake.lastDeletedID
        #expect(deleteCount == 1)
        #expect(lastDeletedID == 1)

        // Cache for that query window should be invalidated so the next read refetches.
        let descriptor = FetchDescriptor<CachedDiaryEntriesPage>()
        let pages = try context.fetch(descriptor)
        #expect(pages.isEmpty)
    }

    @Test func updateEntryDelegatesToNetworkAndInvalidatesCache() async throws {
        let context = makeInMemoryContext()
        let fake = FakeDiaryRepository()
        let repo = CachingDiaryRepository(wrapping: fake, context: context)
        let from = Date(timeIntervalSince1970: 0)
        await fake.setEntries([sampleEntry(id: 1)])
        _ = try await repo.entries(from: from, to: nil)

        try await repo.updateEntry(id: 1, servings: 2, consumedAt: Date())

        let updateCount = await fake.updateCallCount
        #expect(updateCount == 1)
        let descriptor = FetchDescriptor<CachedDiaryEntriesPage>()
        let pages = try context.fetch(descriptor)
        #expect(pages.isEmpty)
    }

    @Test func createEntryDelegatesToNetworkAndInvalidatesCache() async throws {
        let context = makeInMemoryContext()
        let fake = FakeDiaryRepository()
        let repo = CachingDiaryRepository(wrapping: fake, context: context)
        let from = Date(timeIntervalSince1970: 0)
        await fake.setEntries([sampleEntry(id: 1)])
        _ = try await repo.entries(from: from, to: nil)

        _ = try await repo.createEntry(.item(nutritionItemID: 1, servings: 1, consumedAt: Date()))

        let descriptor = FetchDescriptor<CachedDiaryEntriesPage>()
        let pages = try context.fetch(descriptor)
        #expect(pages.isEmpty)
    }
}

// MARK: - CachingNutritionItemRepository

@MainActor
struct CachingNutritionItemRepositoryTests {
    @Test func itemFallsBackToCacheOnNetworkError() async throws {
        let context = makeInMemoryContext()
        let fake = FakeNutritionItemRepository()
        let repo = CachingNutritionItemRepository(wrapping: fake, context: context)
        await fake.setItem(sampleItem(id: 7))
        _ = try await repo.item(id: 7)

        await fake.setError(TestError())
        let result = try await repo.item(id: 7)
        #expect(result.id == 7)
        #expect(result.description == "Oats")
    }

    @Test func throwsWhenNetworkFailsAndNoCacheExists() async throws {
        let context = makeInMemoryContext()
        let fake = FakeNutritionItemRepository()
        await fake.setError(TestError())
        let repo = CachingNutritionItemRepository(wrapping: fake, context: context)

        await #expect(throws: Error.self) {
            try await repo.item(id: 99)
        }
    }

    @Test func reconcilesCacheAfterSuccessfulFetch() async throws {
        let context = makeInMemoryContext()
        let fake = FakeNutritionItemRepository()
        let repo = CachingNutritionItemRepository(wrapping: fake, context: context)
        await fake.setItem(sampleItem(id: 1))
        _ = try await repo.item(id: 1)

        var updated = sampleItem(id: 1)
        updated.description = "Updated Oats"
        await fake.setItem(updated)
        let result = try await repo.item(id: 1)

        #expect(result.description == "Updated Oats")
    }

    @Test func updateDelegatesToNetworkAndInvalidatesCache() async throws {
        let context = makeInMemoryContext()
        let fake = FakeNutritionItemRepository()
        let repo = CachingNutritionItemRepository(wrapping: fake, context: context)
        await fake.setItem(sampleItem(id: 1))
        _ = try await repo.item(id: 1)

        try await repo.update(id: 1, NutritionItemInput(sampleItem(id: 1)))

        let updateCount = await fake.updateCallCount
        #expect(updateCount == 1)
        let descriptor = FetchDescriptor<CachedNutritionItem>(predicate: #Predicate { $0.itemID == 1 })
        let cached = try context.fetch(descriptor)
        #expect(cached.isEmpty)
    }
}

// MARK: - CachingRecipeRepository

@MainActor
struct CachingRecipeRepositoryTests {
    @Test func recipeFallsBackToCacheOnNetworkError() async throws {
        let context = makeInMemoryContext()
        let fake = FakeRecipeRepository()
        let repo = CachingRecipeRepository(wrapping: fake, context: context)
        await fake.setRecipe(sampleRecipe(id: 3))
        _ = try await repo.recipe(id: 3)

        await fake.setError(TestError())
        let result = try await repo.recipe(id: 3)
        #expect(result.id == 3)
        #expect(result.name == "Breakfast")
    }

    @Test func throwsWhenNetworkFailsAndNoCacheExists() async throws {
        let context = makeInMemoryContext()
        let fake = FakeRecipeRepository()
        await fake.setError(TestError())
        let repo = CachingRecipeRepository(wrapping: fake, context: context)

        await #expect(throws: Error.self) {
            try await repo.recipe(id: 99)
        }
    }

    @Test func updateDelegatesToNetworkAndInvalidatesCache() async throws {
        let context = makeInMemoryContext()
        let fake = FakeRecipeRepository()
        let repo = CachingRecipeRepository(wrapping: fake, context: context)
        await fake.setRecipe(sampleRecipe(id: 1))
        _ = try await repo.recipe(id: 1)

        try await repo.update(id: 1, name: "New Name", totalServings: 3, items: [])

        let updateCount = await fake.updateCallCount
        #expect(updateCount == 1)
        let descriptor = FetchDescriptor<CachedRecipe>(predicate: #Predicate { $0.recipeID == 1 })
        let cached = try context.fetch(descriptor)
        #expect(cached.isEmpty)
    }
}

// MARK: - CachingTargetsRepository

@MainActor
struct CachingTargetsRepositoryTests {
    @Test func targetsFallBackToCacheOnNetworkError() async throws {
        let context = makeInMemoryContext()
        let fake = FakeTargetsRepository()
        let repo = CachingTargetsRepository(wrapping: fake, context: context)
        let custom = NutritionTargets(calories: 1800, caloriesMax: 2200, proteinGrams: 140, dietaryFiberGrams: 30, addedSugarsGrams: 20)
        await fake.setTargets(custom)
        _ = try await repo.targets()

        await fake.setError(TestError())
        let result = try await repo.targets()
        #expect(result == custom)
    }

    @Test func throwsWhenNetworkFailsAndNoCacheExists() async throws {
        let context = makeInMemoryContext()
        let fake = FakeTargetsRepository()
        await fake.setError(TestError())
        let repo = CachingTargetsRepository(wrapping: fake, context: context)

        await #expect(throws: Error.self) {
            try await repo.targets()
        }
    }

    @Test func saveDelegatesToNetworkAndUpdatesCache() async throws {
        let context = makeInMemoryContext()
        let fake = FakeTargetsRepository()
        let repo = CachingTargetsRepository(wrapping: fake, context: context)
        let updated = NutritionTargets(calories: 1900, caloriesMax: 2300, proteinGrams: 150, dietaryFiberGrams: 28, addedSugarsGrams: 22)

        try await repo.save(updated)

        let saveCount = await fake.saveCallCount
        #expect(saveCount == 1)

        // Cache should reflect the saved value without needing another network call.
        await fake.setError(TestError())
        let result = try await repo.targets()
        #expect(result == updated)
    }
}
