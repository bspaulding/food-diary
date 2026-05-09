import { describe, it, expect } from "vitest";
import {
  calculateDaysBetween,
  calculateDailyAverage,
  calculateFourWeeksDays,
} from "./WeeklyStatsCalculations";

describe("WeeklyStatsCalculations", () => {
  describe("calculateDaysBetween", () => {
    it("calculates days between two dates", () => {
      const start = new Date("2024-01-01T00:00:00Z");
      const end = new Date("2024-01-08T00:00:00Z");
      expect(calculateDaysBetween(start, end)).toBe(7);
    });

    it("returns 1 for same day (minimum)", () => {
      const start = new Date("2024-01-01T00:00:00Z");
      const end = new Date("2024-01-01T00:00:00Z");
      expect(calculateDaysBetween(start, end)).toBe(1);
    });

    it("returns 1 for partial day (minimum)", () => {
      const start = new Date("2024-01-01T00:00:00Z");
      const end = new Date("2024-01-01T12:00:00Z");
      expect(calculateDaysBetween(start, end)).toBe(1);
    });
  });

  describe("calculateDailyAverage", () => {
    it("calculates average and rounds up", () => {
      expect(calculateDailyAverage(2100, 7)).toBe(300);
    });

    it("rounds up partial calories", () => {
      expect(calculateDailyAverage(2150, 7)).toBe(308); // 307.14... rounds up to 308
    });

    it("handles zero calories", () => {
      expect(calculateDailyAverage(0, 7)).toBe(0);
    });
  });

  describe("calculateFourWeeksDays", () => {
    it("calculates 28 days for exactly 4 weeks later", () => {
      const date = new Date("2024-01-29T12:00:00Z");
      expect(calculateFourWeeksDays(date)).toBe(28);
    });

    it("calculates correct days for mid-week date", () => {
      const date = new Date("2024-02-15T12:00:00Z"); // Some Thursday
      // 4 weeks ago would be 2024-01-18, so we expect 28 days
      expect(calculateFourWeeksDays(date)).toBe(28);
    });
  });
});
