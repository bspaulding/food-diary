import Testing
import Foundation
@testable import FoodDiary

private func pacificCalendar() -> Calendar {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
    return calendar
}

struct CSVExportTests {
    private let calendar = pacificCalendar()

    private func makeItem(
        description: String, calories: Double = 0, totalFatGrams: Double = 0,
        saturatedFatGrams: Double = 0, transFatGrams: Double = 0,
        polyunsaturatedFatGrams: Double = 0, monounsaturatedFatGrams: Double = 0,
        cholesterolMilligrams: Double = 0, sodiumMilligrams: Double = 0,
        totalCarbohydrateGrams: Double = 0, dietaryFiberGrams: Double = 0,
        totalSugarsGrams: Double = 0, addedSugarsGrams: Double = 0, proteinGrams: Double = 0
    ) -> ExportNutritionItem {
        ExportNutritionItem(
            description: description, calories: calories, totalFatGrams: totalFatGrams,
            saturatedFatGrams: saturatedFatGrams, transFatGrams: transFatGrams,
            polyunsaturatedFatGrams: polyunsaturatedFatGrams, monounsaturatedFatGrams: monounsaturatedFatGrams,
            cholesterolMilligrams: cholesterolMilligrams, sodiumMilligrams: sodiumMilligrams,
            totalCarbohydrateGrams: totalCarbohydrateGrams, dietaryFiberGrams: dietaryFiberGrams,
            totalSugarsGrams: totalSugarsGrams, addedSugarsGrams: addedSugarsGrams, proteinGrams: proteinGrams)
    }

    @Test func convertsItemAndRecipeEntriesToCsvMatchingWebGoldenFixture() {
        let consumedAt1 = JSONCoding.isoString8601(from: "2022-08-28T14:30:00+00:00")!
        let consumedAt2 = JSONCoding.isoString8601(from: "2022-08-29T14:30:00+00:00")!

        let oats = makeItem(
            description: "Honey Bunches of Oats", calories: 160, totalFatGrams: 2, saturatedFatGrams: 0,
            transFatGrams: 0, polyunsaturatedFatGrams: 0.5, monounsaturatedFatGrams: 1,
            cholesterolMilligrams: 0, sodiumMilligrams: 190, totalCarbohydrateGrams: 34,
            dietaryFiberGrams: 2, totalSugarsGrams: 9, addedSugarsGrams: 8, proteinGrams: 3)
        let almondmilk = makeItem(
            description: "Almondmilk", calories: 60, totalFatGrams: 2.5, saturatedFatGrams: 0,
            transFatGrams: 0, polyunsaturatedFatGrams: 0.5, monounsaturatedFatGrams: 1.5,
            cholesterolMilligrams: 0, sodiumMilligrams: 150, totalCarbohydrateGrams: 8,
            dietaryFiberGrams: 0, totalSugarsGrams: 7, addedSugarsGrams: 7, proteinGrams: 1)

        let entries = [
            ExportEntry(servings: 1, consumedAt: consumedAt1, nutritionItem: oats, recipe: nil),
            ExportEntry(servings: 1, consumedAt: consumedAt1, nutritionItem: almondmilk, recipe: nil),
            ExportEntry(
                servings: 2, consumedAt: consumedAt2, nutritionItem: nil,
                recipe: ExportRecipe(
                    name: "Test Recipe",
                    recipeItems: [
                        ExportRecipeItem(servings: 2, nutritionItem: almondmilk),
                        ExportRecipeItem(servings: 1, nutritionItem: oats),
                    ])),
        ]

        let csv = CSV.entriesToCsv(entries, calendar: calendar)
        let expected = """
            Date,Time,Consumed At,Description,Servings,Calories,Total Fat (g),Saturated Fat (g),Trans Fat (g),Polyunsaturated Fat (g),Monounsaturated Fat (g),Cholesterol (mg),Sodium (mg),Total Carbohydrate (g),Dietary Fiber (g),Total Sugars (g),Added Sugars (g),Protein (g)
            2022-08-28,7:30 AM,2022-08-28T07:30:00-07:00,"Honey Bunches of Oats",1,160,2,0,0,0.5,1,0,190,34,2,9,8,3
            2022-08-28,7:30 AM,2022-08-28T07:30:00-07:00,"Almondmilk",1,60,2.5,0,0,0.5,1.5,0,150,8,0,7,7,1
            2022-08-29,7:30 AM,2022-08-29T07:30:00-07:00,"Test Recipe - Almondmilk",4,60,2.5,0,0,0.5,1.5,0,150,8,0,7,7,1
            2022-08-29,7:30 AM,2022-08-29T07:30:00-07:00,"Test Recipe - Honey Bunches of Oats",2,160,2,0,0,0.5,1,0,190,34,2,9,8,3
            """
        #expect(csv == expected)
    }

    @Test func quotesDescriptionFieldWithComma() {
        let consumedAt = JSONCoding.isoString8601(from: "2022-08-28T14:30:00+00:00")!
        let item = makeItem(description: "Salad, mixed greens", calories: 20, sodiumMilligrams: 10, totalCarbohydrateGrams: 4, dietaryFiberGrams: 2, totalSugarsGrams: 1, proteinGrams: 1)
        let entries = [ExportEntry(servings: 1, consumedAt: consumedAt, nutritionItem: item, recipe: nil)]
        let csv = CSV.entriesToCsv(entries, calendar: calendar)
        #expect(csv.contains("\"Salad, mixed greens\""))
    }

    @Test func escapesDoubleQuotesInDescriptionField() {
        let consumedAt = JSONCoding.isoString8601(from: "2022-08-28T14:30:00+00:00")!
        let item = makeItem(description: "Chocolate \"Dark\" Bar", calories: 200, totalFatGrams: 12, saturatedFatGrams: 7, polyunsaturatedFatGrams: 1, monounsaturatedFatGrams: 4, sodiumMilligrams: 5, totalCarbohydrateGrams: 20, dietaryFiberGrams: 3, totalSugarsGrams: 15, addedSugarsGrams: 14, proteinGrams: 2)
        let entries = [ExportEntry(servings: 1, consumedAt: consumedAt, nutritionItem: item, recipe: nil)]
        let csv = CSV.entriesToCsv(entries, calendar: calendar)
        #expect(csv.contains("\"Chocolate \"\"Dark\"\" Bar\""))
    }

    @Test func skipsEntriesWithNeitherItemNorRecipe() {
        let consumedAt = JSONCoding.isoString8601(from: "2022-08-28T14:30:00+00:00")!
        let entries = [ExportEntry(servings: 1, consumedAt: consumedAt, nutritionItem: nil, recipe: nil)]
        let csv = CSV.entriesToCsv(entries, calendar: calendar)
        let lines = csv.split(separator: "\n", omittingEmptySubsequences: false)
        #expect(lines.count == 1)
        #expect(lines[0].hasPrefix("Date,Time,Consumed At"))
    }
}

struct CSVImportTests {
    private let calendar = pacificCalendar()

    @Test func parsesCsvIntoRowDictionaries() {
        let csv = "Date,Time,Consumed At,Description,Servings\n2022-08-28,7:30 AM,2022-08-28T07:30:00-07:00,Honey Bunches of Oats,1"
        let rows = CSV.parseCSV(csv)
        #expect(rows.count == 1)
        #expect(rows[0]["Consumed At"] == "2022-08-28T07:30:00-07:00")
        #expect(rows[0]["Description"] == "Honey Bunches of Oats")
    }

    @Test func parsesQuotedFieldsWithEmbeddedCommasAndEscapedQuotes() {
        let csv = "Description,Servings\n\"Salad, mixed \"\"greens\"\"\",1"
        let rows = CSV.parseCSV(csv)
        #expect(rows[0]["Description"] == "Salad, mixed \"greens\"")
        #expect(rows[0]["Servings"] == "1")
    }

    @Test func rowToEntryParsesAllNumericFieldsAndConsumedAt() throws {
        let row: [String: String] = [
            "Consumed At": "2022-08-28T07:30:00-07:00",
            "Description": "Honey Bunches of Oats",
            "Servings": "1",
            "Calories": "160",
            "Total Fat (g)": "2",
            "Saturated Fat (g)": "0",
            "Trans Fat (g)": "0",
            "Polyunsaturated Fat (g)": "0.5",
            "Monounsaturated Fat (g)": "1",
            "Cholesterol (mg)": "0",
            "Sodium (mg)": "190",
            "Total Carbohydrate (g)": "34",
            "Dietary Fiber (g)": "2",
            "Total Sugars (g)": "9",
            "Added Sugars (g)": "8",
            "Protein (g)": "3",
        ]
        let result = CSV.rowToEntry(row)
        let entry = try result.get()
        #expect(entry.consumedAt == "2022-08-28T07:30:00-07:00")
        #expect(entry.servings == 1)
        #expect(entry.nutritionItem.description == "Honey Bunches of Oats")
        #expect(entry.nutritionItem.calories == 160)
        #expect(entry.nutritionItem.totalFatGrams == 2)
        #expect(entry.nutritionItem.polyunsaturatedFatGrams == 0.5)
        #expect(entry.nutritionItem.monounsaturatedFatGrams == 1)
        #expect(entry.nutritionItem.sodiumMilligrams == 190)
        #expect(entry.nutritionItem.totalCarbohydrateGrams == 34)
        #expect(entry.nutritionItem.dietaryFiberGrams == 2)
        #expect(entry.nutritionItem.totalSugarsGrams == 9)
        #expect(entry.nutritionItem.addedSugarsGrams == 8)
        #expect(entry.nutritionItem.proteinGrams == 3)
    }

    @Test func rowToEntryDefaultsMissingOrUnparsableNumbersToZero() throws {
        let row: [String: String] = [
            "Consumed At": "2022-08-28T07:30:00-07:00",
            "Description": "Mystery Snack",
            "Servings": "1",
            "Calories": "",
            "Total Fat (g)": "",
        ]
        let result = CSV.rowToEntry(row)
        let entry = try result.get()
        #expect(entry.nutritionItem.calories == 0)
        #expect(entry.nutritionItem.totalFatGrams == 0)
        #expect(entry.nutritionItem.proteinGrams == 0)
    }

    @Test func rowToEntryFailsOnInvalidConsumedAtDate() {
        let row: [String: String] = [
            "Consumed At": "invalid-date",
            "Description": "Test Food",
            "Servings": "1",
        ]
        let result = CSV.rowToEntry(row)
        switch result {
        case .failure(let error):
            #expect(error.message == "Invalid Consumed At Date")
        case .success:
            Issue.record("expected failure for invalid date")
        }
    }

    @Test func roundTripsExportThenImport() throws {
        let consumedAt = JSONCoding.isoString8601(from: "2022-08-28T14:30:00+00:00")!
        let item = ExportNutritionItem(
            description: "Round Trip Item", calories: 100, totalFatGrams: 5, saturatedFatGrams: 1,
            transFatGrams: 0, polyunsaturatedFatGrams: 0.5, monounsaturatedFatGrams: 1.5,
            cholesterolMilligrams: 10, sodiumMilligrams: 200, totalCarbohydrateGrams: 15,
            dietaryFiberGrams: 3, totalSugarsGrams: 5, addedSugarsGrams: 2, proteinGrams: 8)
        let entries = [ExportEntry(servings: 1.5, consumedAt: consumedAt, nutritionItem: item, recipe: nil)]

        let csv = CSV.entriesToCsv(entries, calendar: calendar)
        let rows = CSV.parseCSV(csv)
        #expect(rows.count == 1)
        let entry = try CSV.rowToEntry(rows[0]).get()

        #expect(entry.servings == 1.5)
        #expect(entry.nutritionItem.description == "Round Trip Item")
        #expect(entry.nutritionItem.calories == 100)
        #expect(entry.nutritionItem.totalFatGrams == 5)
        #expect(entry.nutritionItem.saturatedFatGrams == 1)
        #expect(entry.nutritionItem.polyunsaturatedFatGrams == 0.5)
        #expect(entry.nutritionItem.monounsaturatedFatGrams == 1.5)
        #expect(entry.nutritionItem.cholesterolMilligrams == 10)
        #expect(entry.nutritionItem.sodiumMilligrams == 200)
        #expect(entry.nutritionItem.totalCarbohydrateGrams == 15)
        #expect(entry.nutritionItem.dietaryFiberGrams == 3)
        #expect(entry.nutritionItem.totalSugarsGrams == 5)
        #expect(entry.nutritionItem.addedSugarsGrams == 2)
        #expect(entry.nutritionItem.proteinGrams == 8)
    }
}
