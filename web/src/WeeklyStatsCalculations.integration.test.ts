import { describe, it, expect } from "vitest";
import { startOfWeek, subWeeks, startOfDay, addDays } from "date-fns";
import {
  calculateFourWeeksDays,
  calculateDailyAverage,
} from "./WeeklyStatsCalculations";

describe("Weekly Stats Integration Tests", () => {
  describe("Average calculation with real-world numbers", () => {
    it("calculates correct average for 1500 kcal over 1 day", () => {
      const avg = calculateDailyAverage(1500, 1);
      expect(avg).toBe(1500);
    });

    it("calculates correct average for 2100 kcal over 7 days (week)", () => {
      const avg = calculateDailyAverage(2100, 7);
      expect(avg).toBe(300);
    });

    it("calculates correct average for 42000 kcal over 28 days (4 weeks)", () => {
      const avg = calculateDailyAverage(42000, 28);
      expect(avg).toBe(1500);
    });

    it("rounds up partial calories correctly", () => {
      // 15000 / 10 = 1500.0 (exact)
      expect(calculateDailyAverage(15000, 10)).toBe(1500);

      // 15001 / 10 = 1500.1 -> rounds up to 1501
      expect(calculateDailyAverage(15001, 10)).toBe(1501);

      // 15009 / 10 = 1500.9 -> rounds up to 1501
      expect(calculateDailyAverage(15009, 10)).toBe(1501);
    });
  });

  describe("Four weeks calculation", () => {
    it("should calculate 28 days for exactly 4 weeks", () => {
      const date = new Date("2024-02-04T12:00:00Z"); // Feb 4, 2024
      const days = calculateFourWeeksDays(date);
      expect(days).toBe(28);
    });

    it("should handle mid-week dates correctly", () => {
      const wednesday = new Date("2024-02-14T12:00:00Z"); // Wednesday
      const days = calculateFourWeeksDays(wednesday);
      // 4 weeks ago from Feb 14 is Jan 17, so we have 28 days
      expect(days).toBe(28);
    });
  });

  describe("Edge cases", () => {
    it("should handle leap year February correctly", () => {
      const leapDay = new Date("2024-02-29T12:00:00Z"); // 2024 is a leap year
      const days = calculateFourWeeksDays(leapDay);
      // 4 weeks = 28 days, regardless of leap year
      expect(days).toBe(28);
    });
  });
});
