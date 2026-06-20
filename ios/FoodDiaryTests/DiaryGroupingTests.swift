import Testing
import Foundation
@testable import FoodDiary

struct DiaryGroupingTests {
    var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    func entry(id: Int, day: Int, hour: Int) -> DiaryEntry {
        var components = DateComponents()
        components.year = 2026
        components.month = 6
        components.day = day
        components.hour = hour
        let date = calendar.date(from: components)!
        return DiaryEntry(id: id, consumedAt: date, calories: 100, servings: 1, nutritionItem: nil, recipe: nil)
    }

    @Test func emptyEntriesProducesEmptyGroups() {
        #expect(DiaryGrouping.groupedByDay([], calendar: calendar).isEmpty)
    }

    @Test func groupsEntriesByLocalDay() {
        let a = entry(id: 1, day: 5, hour: 9)
        let b = entry(id: 2, day: 5, hour: 18)
        let c = entry(id: 3, day: 6, hour: 9)
        let groups = DiaryGrouping.groupedByDay([a, b, c], calendar: calendar)
        #expect(groups.count == 2)
        #expect(groups[0].entries.map(\.id) == [3])
        #expect(groups[1].entries.map(\.id) == [1, 2])
    }

    @Test func sortsDaysDescending() {
        let earlier = entry(id: 1, day: 1, hour: 9)
        let later = entry(id: 2, day: 10, hour: 9)
        let groups = DiaryGrouping.groupedByDay([earlier, later], calendar: calendar)
        #expect(groups.map(\.entries.first!.id) == [2, 1])
    }

    @Test func sortsEntriesWithinADayAscendingByConsumedAt() {
        let late = entry(id: 1, day: 5, hour: 20)
        let early = entry(id: 2, day: 5, hour: 6)
        let groups = DiaryGrouping.groupedByDay([late, early], calendar: calendar)
        #expect(groups[0].entries.map(\.id) == [2, 1])
    }
}
