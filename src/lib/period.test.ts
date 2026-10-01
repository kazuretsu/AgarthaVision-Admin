import { describe, expect, it } from "vitest";
import { describePeriod, parsePeriod } from "./period";

describe("parsePeriod", () => {
  it("keeps real dates", () => {
    expect(parsePeriod({ from: "2026-09-01", to: "2026-09-30" })).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it("drops text that is not a real calendar date", () => {
    expect(parsePeriod({ from: "2026-02-30", to: "yesterday" })).toEqual({});
  });

  it("swaps a reversed pair", () => {
    expect(parsePeriod({ from: "2026-09-30", to: "2026-09-01" })).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it("reads the first of repeated parameters", () => {
    expect(parsePeriod({ from: ["2026-09-01", "2026-01-01"] })).toEqual({ from: "2026-09-01" });
  });
});

describe("describePeriod", () => {
  it("names each shape", () => {
    expect(describePeriod({})).toBe("all time");
    expect(describePeriod({ from: "2026-09-01" })).toBe("from 2026-09-01");
    expect(describePeriod({ to: "2026-09-30" })).toBe("up to 2026-09-30");
    expect(describePeriod({ from: "2026-09-01", to: "2026-09-30" })).toBe(
      "2026-09-01 to 2026-09-30",
    );
  });
});
