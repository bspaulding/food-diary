import Foundation

/// Mirrors `web/src/Api.ts`'s `WeeklyTrendsData` (one row of the
/// `food_diary_trends_weekly` Hasura view). `weekOfYear` is treated as a
/// string at the API boundary (per the web type), but the underlying Postgres
/// column is an `int`, so this decodes either a JSON string or a JSON number.
struct WeeklyTrendsData: Codable, Hashable, Sendable {
    var weekOfYear: String
    var protein: Double
    var calories: Double
    var addedSugar: Double

    enum CodingKeys: String, CodingKey {
        case weekOfYear, protein, calories, addedSugar
    }

    init(weekOfYear: String, protein: Double, calories: Double, addedSugar: Double) {
        self.weekOfYear = weekOfYear
        self.protein = protein
        self.calories = calories
        self.addedSugar = addedSugar
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let stringValue = try? container.decode(String.self, forKey: .weekOfYear) {
            weekOfYear = stringValue
        } else {
            let intValue = try container.decode(Int.self, forKey: .weekOfYear)
            weekOfYear = String(intValue)
        }
        protein = try container.decode(Double.self, forKey: .protein)
        calories = try container.decode(Double.self, forKey: .calories)
        addedSugar = try container.decode(Double.self, forKey: .addedSugar)
    }
}
