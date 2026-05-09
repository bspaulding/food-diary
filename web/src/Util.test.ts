import { describe, it, expect } from "vitest";
import {
  accessorsToObject,
  parseAndFormatTime,
  parseAndFormatDay,
  pluralize,
} from "./Util";

describe("Util", () => {
  describe("accessorsToObject", () => {
    it("converts accessors to object", () => {
      const accessors = {
        name: () => "John",
        age: () => 30,
        active: () => true,
      };
      const result = accessorsToObject(accessors);
      expect(result).toEqual({
        name: "John",
        age: 30,
        active: true,
      });
    });

    it("handles empty accessors", () => {
      const result = accessorsToObject({});
      expect(result).toEqual({});
    });

    it("handles single accessor", () => {
      const accessors = {
        value: () => 42,
      };
      const result = accessorsToObject(accessors);
      expect(result).toEqual({ value: 42 });
    });
  });

  describe("parseAndFormatTime", () => {
    it("formats timestamp to time", () => {
      const timestamp = "2024-01-15T14:30:00Z";
      const result = parseAndFormatTime(timestamp);
      // The exact format depends on the locale, but it should contain time information
      expect(result).toMatch(/\d{1,2}:\d{2}/); // Should have HH:MM format
    });

    it("formats different times correctly", () => {
      const morning = "2024-01-15T09:00:00Z";
      const afternoon = "2024-01-15T15:45:00Z";
      const morningResult = parseAndFormatTime(morning);
      const afternoonResult = parseAndFormatTime(afternoon);
      expect(morningResult).not.toBe(afternoonResult);
    });
  });

  describe("parseAndFormatDay", () => {
    it("formats timestamp to full date", () => {
      const timestamp = "2024-01-15T14:30:00Z";
      const result = parseAndFormatDay(timestamp);
      // The exact format depends on the locale, but it should contain date information
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });

    it("formats different dates correctly", () => {
      const date1 = "2024-01-15T09:00:00Z";
      const date2 = "2024-02-20T09:00:00Z";
      const result1 = parseAndFormatDay(date1);
      const result2 = parseAndFormatDay(date2);
      expect(result1).not.toBe(result2);
    });
  });

  describe("pluralize", () => {
    it("returns singular for 1", () => {
      expect(pluralize(1, "item", "items")).toBe("1 item");
    });

    it("returns plural for 0", () => {
      expect(pluralize(0, "item", "items")).toBe("0 items");
    });

    it("returns plural for 2", () => {
      expect(pluralize(2, "item", "items")).toBe("2 items");
    });

    it("returns plural for large numbers", () => {
      expect(pluralize(100, "item", "items")).toBe("100 items");
    });

    it("works with different words", () => {
      expect(pluralize(1, "day", "days")).toBe("1 day");
      expect(pluralize(5, "day", "days")).toBe("5 days");
      expect(pluralize(1, "person", "people")).toBe("1 person");
      expect(pluralize(10, "person", "people")).toBe("10 people");
    });
  });
});
