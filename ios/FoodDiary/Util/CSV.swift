import Foundation

/// Port of `web/src/CSVExport.ts` / `web/src/CSVImport.ts` — column order,
/// quoting, and number formatting must match the web app exactly so files
/// round-trip between platforms.
enum CSV {
    static let header = [
        "Date", "Time", "Consumed At", "Description", "Servings", "Calories",
        "Total Fat (g)", "Saturated Fat (g)", "Trans Fat (g)", "Polyunsaturated Fat (g)",
        "Monounsaturated Fat (g)", "Cholesterol (mg)", "Sodium (mg)", "Total Carbohydrate (g)",
        "Dietary Fiber (g)", "Total Sugars (g)", "Added Sugars (g)", "Protein (g)",
    ]

    struct ImportError: Error, Sendable {
        var message: String
    }

    struct ImportedEntry: Sendable {
        var consumedAt: String
        var servings: Double
        var nutritionItem: ExportNutritionItem
    }

    static func entriesToCsv(_ entries: [ExportEntry], calendar: Calendar) -> String {
        var rows: [[String]] = [header]
        for entry in entries {
            if let item = entry.nutritionItem {
                rows.append(
                    row(consumedAt: entry.consumedAt, servings: entry.servings,
                        description: item.description, item: item, calendar: calendar))
            } else if let recipe = entry.recipe {
                for recipeItem in recipe.recipeItems {
                    rows.append(
                        row(consumedAt: entry.consumedAt, servings: entry.servings * recipeItem.servings,
                            description: "\(recipe.name) - \(recipeItem.nutritionItem.description)",
                            item: recipeItem.nutritionItem, calendar: calendar))
                }
            }
        }
        return rows.map { $0.joined(separator: ",") }.joined(separator: "\n")
    }

    static func parseCSV(_ csv: String) -> [[String: String]] {
        let rows = parseRows(csv)
        guard let header = rows.first else { return [] }
        return rows.dropFirst().map { row in
            var dict: [String: String] = [:]
            for (index, key) in header.enumerated() where index < row.count {
                dict[key] = row[index]
            }
            return dict
        }
    }

    static func rowToEntry(_ row: [String: String]) -> Result<ImportedEntry, ImportError> {
        guard let consumedAtString = row["Consumed At"],
            JSONCoding.isoString8601(from: consumedAtString) != nil
        else {
            return .failure(ImportError(message: "Invalid Consumed At Date"))
        }
        let item = ExportNutritionItem(
            description: row["Description"] ?? "",
            calories: number(row["Calories"]),
            totalFatGrams: number(row["Total Fat (g)"]),
            saturatedFatGrams: number(row["Saturated Fat (g)"]),
            transFatGrams: number(row["Trans Fat (g)"]),
            polyunsaturatedFatGrams: number(row["Polyunsaturated Fat (g)"]),
            monounsaturatedFatGrams: number(row["Monounsaturated Fat (g)"]),
            cholesterolMilligrams: number(row["Cholesterol (mg)"]),
            sodiumMilligrams: number(row["Sodium (mg)"]),
            totalCarbohydrateGrams: number(row["Total Carbohydrate (g)"]),
            dietaryFiberGrams: number(row["Dietary Fiber (g)"]),
            totalSugarsGrams: number(row["Total Sugars (g)"]),
            addedSugarsGrams: number(row["Added Sugars (g)"]),
            proteinGrams: number(row["Protein (g)"]))
        return .success(
            ImportedEntry(
                consumedAt: consumedAtString, servings: number(row["Servings"]), nutritionItem: item))
    }

    private static func row(
        consumedAt: Date, servings: Double, description: String, item: ExportNutritionItem,
        calendar: Calendar
    ) -> [String] {
        header.map { column in
            switch column {
            case "Date": return dateString(consumedAt, calendar: calendar)
            case "Time": return timeString(consumedAt, calendar: calendar)
            case "Consumed At": return isoString(consumedAt, calendar: calendar)
            case "Description": return quote(description)
            case "Servings": return format(servings)
            case "Calories": return format(item.calories)
            case "Total Fat (g)": return format(item.totalFatGrams)
            case "Saturated Fat (g)": return format(item.saturatedFatGrams)
            case "Trans Fat (g)": return format(item.transFatGrams)
            case "Polyunsaturated Fat (g)": return format(item.polyunsaturatedFatGrams)
            case "Monounsaturated Fat (g)": return format(item.monounsaturatedFatGrams)
            case "Cholesterol (mg)": return format(item.cholesterolMilligrams)
            case "Sodium (mg)": return format(item.sodiumMilligrams)
            case "Total Carbohydrate (g)": return format(item.totalCarbohydrateGrams)
            case "Dietary Fiber (g)": return format(item.dietaryFiberGrams)
            case "Total Sugars (g)": return format(item.totalSugarsGrams)
            case "Added Sugars (g)": return format(item.addedSugarsGrams)
            case "Protein (g)": return format(item.proteinGrams)
            default: return ""
            }
        }
    }

    private static func quote(_ field: String) -> String {
        "\"\(field.replacingOccurrences(of: "\"", with: "\"\""))\""
    }

    private static func format(_ value: Double) -> String {
        value == value.rounded() ? String(Int(value)) : String(value)
    }

    private static func number(_ value: String?) -> Double {
        guard let value, let parsed = Double(value) else { return 0 }
        return parsed
    }

    private static func dateString(_ date: Date, calendar: Calendar) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private static func timeString(_ date: Date, calendar: Calendar) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.locale = Locale(identifier: "en_US")
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: date)
    }

    private static func isoString(_ date: Date, calendar: Calendar) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.timeZone = calendar.timeZone
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: date)
    }

    private static func parseRows(_ csv: String) -> [[String]] {
        var rows: [[String]] = []
        var currentRow: [String] = []
        var currentField = ""
        var inQuotes = false
        let chars = Array(csv)
        var i = 0
        while i < chars.count {
            let c = chars[i]
            if inQuotes {
                if c == "\"" {
                    if i + 1 < chars.count, chars[i + 1] == "\"" {
                        currentField.append("\"")
                        i += 2
                    } else {
                        inQuotes = false
                        i += 1
                    }
                } else {
                    currentField.append(c)
                    i += 1
                }
            } else if c == "\"" {
                inQuotes = true
                i += 1
            } else if c == "," {
                currentRow.append(currentField)
                currentField = ""
                i += 1
            } else if c == "\n" {
                currentRow.append(currentField)
                rows.append(currentRow)
                currentRow = []
                currentField = ""
                i += 1
            } else if c == "\r" {
                i += 1
            } else {
                currentField.append(c)
                i += 1
            }
        }
        if !currentField.isEmpty || !currentRow.isEmpty {
            currentRow.append(currentField)
            rows.append(currentRow)
        }
        return rows
    }
}
