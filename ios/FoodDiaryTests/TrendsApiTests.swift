import Testing
import Foundation
@testable import FoodDiary

struct TrendsApiTests {
    @Test func decodesWeeklyTrendsResponse() throws {
        let json = """
            { "food_diary_trends_weekly": [
                { "week_of_year": "23", "protein": 95.5, "calories": 1850.25, "added_sugar": 18.0 },
                { "week_of_year": "24", "protein": 102.0, "calories": 1920.0, "added_sugar": 12.5 }
              ] }
            """
        let response = try JSONCoding.decoder.decode(
            Api.Trends.WeeklyTrendsResponse.self, from: Data(json.utf8))
        #expect(response.foodDiaryTrendsWeekly.count == 2)
        let first = response.foodDiaryTrendsWeekly[0]
        #expect(first.weekOfYear == "23")
        #expect(first.protein == 95.5)
        #expect(first.calories == 1850.25)
        #expect(first.addedSugar == 18.0)
    }

    @Test func decodesWeekOfYearWhenServerReturnsInteger() throws {
        let json = """
            { "food_diary_trends_weekly": [
                { "week_of_year": 23, "protein": 95.5, "calories": 1850.25, "added_sugar": 18.0 }
              ] }
            """
        let response = try JSONCoding.decoder.decode(
            Api.Trends.WeeklyTrendsResponse.self, from: Data(json.utf8))
        #expect(response.foodDiaryTrendsWeekly[0].weekOfYear == "23")
    }

    @Test func decodesEmptyTrendsResponse() throws {
        let json = "{ \"food_diary_trends_weekly\": [] }"
        let response = try JSONCoding.decoder.decode(
            Api.Trends.WeeklyTrendsResponse.self, from: Data(json.utf8))
        #expect(response.foodDiaryTrendsWeekly.isEmpty)
    }
}
