import { describe, expect, it } from "vitest";
import { DetectionVerdict, parseDetectionVerdict } from "./enums";

describe("parseDetectionVerdict", () => {
  it("reads the Postgres form and the app's lowercase form", () => {
    expect(parseDetectionVerdict("FALSE_POSITIVE")).toBe(DetectionVerdict.FalsePositive);
    expect(parseDetectionVerdict("wrong_class")).toBe(DetectionVerdict.WrongClass);
  });

  it("falls back to the column default for unknown text", () => {
    expect(parseDetectionVerdict("maybe")).toBe(DetectionVerdict.Confirmed);
    expect(parseDetectionVerdict(null)).toBe(DetectionVerdict.Confirmed);
  });
});
