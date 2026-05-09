import { describe, it, expect } from "vitest";
import { isLeft, isRight, Left, Right, split, Either } from "./Either";

describe("Either", () => {
  describe("Left", () => {
    it("creates a Left value", () => {
      const left = Left("error");
      expect(left).toEqual({ value: "error", tag: "left" });
    });

    it("creates a Left with different types", () => {
      const leftNumber = Left(42);
      expect(leftNumber).toEqual({ value: 42, tag: "left" });

      const leftObject = Left({ code: 404 });
      expect(leftObject).toEqual({ value: { code: 404 }, tag: "left" });
    });
  });

  describe("Right", () => {
    it("creates a Right value", () => {
      const right = Right("success");
      expect(right).toEqual({ value: "success", tag: "right" });
    });

    it("creates a Right with different types", () => {
      const rightNumber = Right(42);
      expect(rightNumber).toEqual({ value: 42, tag: "right" });

      const rightObject = Right({ result: "ok" });
      expect(rightObject).toEqual({ value: { result: "ok" }, tag: "right" });
    });
  });

  describe("isLeft", () => {
    it("returns true for Left values", () => {
      const left = Left("error");
      expect(isLeft(left)).toBe(true);
    });

    it("returns false for Right values", () => {
      const right = Right("success");
      expect(isLeft(right)).toBe(false);
    });

    it("returns false for objects without left tag", () => {
      expect(isLeft({ value: "test", tag: "right" })).toBe(false);
      expect(
        isLeft({ tag: "other" } as unknown as Either<unknown, unknown>),
      ).toBe(false);
    });
  });

  describe("isRight", () => {
    it("returns true for Right values", () => {
      const right = Right("success");
      expect(isRight(right)).toBe(true);
    });

    it("returns false for Left values", () => {
      const left = Left("error");
      expect(isRight(left)).toBe(false);
    });

    it("returns false for objects without right tag", () => {
      expect(isRight({ value: "test", tag: "left" })).toBe(false);
      expect(
        isRight({ tag: "other" } as unknown as Either<unknown, unknown>),
      ).toBe(false);
    });
  });

  describe("split", () => {
    it("splits empty array", () => {
      const result = split([]);
      expect(result).toEqual({ lefts: [], rights: [] });
    });

    it("splits array with only Lefts", () => {
      const result = split([Left("error1"), Left("error2")]);
      expect(result).toEqual({ lefts: ["error1", "error2"], rights: [] });
    });

    it("splits array with only Rights", () => {
      const result = split([Right("success1"), Right("success2")]);
      expect(result).toEqual({ lefts: [], rights: ["success1", "success2"] });
    });

    it("splits array with mixed Lefts and Rights", () => {
      const result = split([
        Left("error1"),
        Right("success1"),
        Left("error2"),
        Right("success2"),
      ]);
      expect(result).toEqual({
        lefts: ["error1", "error2"],
        rights: ["success1", "success2"],
      });
    });

    it("preserves order within lefts and rights", () => {
      const result = split([
        Right(1),
        Left("a"),
        Right(2),
        Left("b"),
        Right(3),
      ]);
      expect(result).toEqual({
        lefts: ["a", "b"],
        rights: [1, 2, 3],
      });
    });
  });
});
