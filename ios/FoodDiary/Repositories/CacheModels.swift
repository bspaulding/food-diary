import Foundation
import SwiftData

/// SwiftData read-through cache entities (Phase 5+ item 2, PRD §5/§14). Each
/// caches the JSON-encoded payload of a repository read, keyed by the query
/// that produced it, so the caching decorators (`CachingRepositories.swift`)
/// can show cached data instantly while a network refresh happens in the
/// background. Reads only — no offline mutation queue (plan explicitly scopes
/// this out).
///
/// Nested/complex models (`DiaryEntry`, `Recipe`, etc.) are stored as encoded
/// JSON blobs rather than mirrored field-by-field into SwiftData relationships:
/// this keeps the cache schema trivial to keep in sync with `Models/*.swift`
/// and avoids a second source of truth for nested shapes that already have
/// `Codable` conformance.
@Model
final class CachedDiaryEntriesPage {
    /// Cache key: the exact `(from, to)` query window, ISO-8601 encoded.
    /// `to == nil` is stored as the empty string to keep the key non-optional.
    @Attribute(.unique) var key: String
    var entriesJSON: Data
    var fetchedAt: Date

    init(key: String, entriesJSON: Data, fetchedAt: Date) {
        self.key = key
        self.entriesJSON = entriesJSON
        self.fetchedAt = fetchedAt
    }

    static func key(from: Date, to: Date?) -> String {
        let fromKey = JSONCoding.isoString(from)
        let toKey = to.map(JSONCoding.isoString) ?? ""
        return "\(fromKey)|\(toKey)"
    }
}

@Model
final class CachedDiaryEntry {
    @Attribute(.unique) var entryID: Int
    var entryJSON: Data
    var fetchedAt: Date

    init(entryID: Int, entryJSON: Data, fetchedAt: Date) {
        self.entryID = entryID
        self.entryJSON = entryJSON
        self.fetchedAt = fetchedAt
    }
}

@Model
final class CachedWeeklyStats {
    /// Cache key: the exact `(currentWeekStart, todayStart, fourWeeksAgoStart)` query.
    @Attribute(.unique) var key: String
    var currentWeekCalories: Double
    var pastFourWeeksCalories: Double
    var fetchedAt: Date

    init(key: String, currentWeekCalories: Double, pastFourWeeksCalories: Double, fetchedAt: Date) {
        self.key = key
        self.currentWeekCalories = currentWeekCalories
        self.pastFourWeeksCalories = pastFourWeeksCalories
        self.fetchedAt = fetchedAt
    }

    static func key(currentWeekStart: Date, todayStart: Date, fourWeeksAgoStart: Date) -> String {
        [currentWeekStart, todayStart, fourWeeksAgoStart].map(JSONCoding.isoString).joined(separator: "|")
    }
}

@Model
final class CachedNutritionItem {
    @Attribute(.unique) var itemID: Int
    var itemJSON: Data
    var fetchedAt: Date

    init(itemID: Int, itemJSON: Data, fetchedAt: Date) {
        self.itemID = itemID
        self.itemJSON = itemJSON
        self.fetchedAt = fetchedAt
    }
}

@Model
final class CachedRecipe {
    @Attribute(.unique) var recipeID: Int
    var recipeJSON: Data
    var fetchedAt: Date

    init(recipeID: Int, recipeJSON: Data, fetchedAt: Date) {
        self.recipeID = recipeID
        self.recipeJSON = recipeJSON
        self.fetchedAt = fetchedAt
    }
}

/// Singleton row (there is exactly one targets record server-side).
@Model
final class CachedNutritionTargets {
    @Attribute(.unique) var singletonKey: String
    var targetsJSON: Data
    var fetchedAt: Date

    init(targetsJSON: Data, fetchedAt: Date) {
        self.singletonKey = "targets"
        self.targetsJSON = targetsJSON
        self.fetchedAt = fetchedAt
    }
}

/// Shared schema/container for the read cache. One `ModelContainer` is created
/// in `AppEnvironment.init()` and its `mainContext` is handed to each caching
/// decorator.
enum CacheSchema {
    static var models: [any PersistentModel.Type] {
        [
            CachedDiaryEntriesPage.self,
            CachedDiaryEntry.self,
            CachedWeeklyStats.self,
            CachedNutritionItem.self,
            CachedRecipe.self,
            CachedNutritionTargets.self,
        ]
    }

    static func makeContainer(inMemory: Bool = false) -> ModelContainer {
        let configuration = ModelConfiguration(isStoredInMemoryOnly: inMemory)
        // swiftlint:disable:next force_try
        return try! ModelContainer(for: Schema(models), configurations: [configuration])
    }
}
