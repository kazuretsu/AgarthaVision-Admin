import { describe, expect, it } from "vitest";
import { PASSWORD_MIN, PASSWORD_RULES, passwordGapMessage, passwordGaps } from "./password-policy";

describe("passwordGaps", () => {
  it("passes a password that meets every rule", () => {
    expect(passwordGaps("Tide-pool-42x")).toEqual([]);
  });

  it("names each rule missed, in the checklist's order", () => {
    expect(passwordGaps("")).toEqual(["length", "lowercase", "uppercase", "digit", "symbol"]);
    expect(passwordGaps("tidepoolwalks")).toEqual(["uppercase", "digit", "symbol"]);
    expect(passwordGaps("Tide-pool-42")).toEqual([]);
    expect(passwordGaps("Tide-pool-4")).toEqual(["length"]);
  });

  it("counts length in bytes, as the provider does", () => {
    // Eleven characters, twelve bytes.
    expect(passwordGaps("Tide-pool-é")).not.toContain("length");
  });

  it("counts only the provider's ASCII sets", () => {
    expect(passwordGaps("ÉÉÉÉ-pool-42")).toContain("uppercase");
    expect(passwordGaps("Tide pool 42")).toContain("symbol");
    expect(passwordGaps("Tide" + String.fromCharCode(92) + "pool" + "42x")).toContain("symbol");
    expect(passwordGaps("Tide:pool:42x")).not.toContain("symbol");
  });

  it("lists every rule once", () => {
    expect(PASSWORD_RULES.map(({ rule }) => rule)).toEqual([
      "length",
      "lowercase",
      "uppercase",
      "digit",
      "symbol",
    ]);
    expect(PASSWORD_RULES[0].label).toContain(String(PASSWORD_MIN));
  });
});

describe("passwordGapMessage", () => {
  it("asks for the one thing missing", () => {
    expect(passwordGapMessage(["symbol"])).toBe("Add a symbol.");
  });

  it("joins several into one sentence", () => {
    expect(passwordGapMessage(["length", "digit", "symbol"])).toBe(
      `Use at least ${PASSWORD_MIN} characters, add a number and add a symbol.`,
    );
  });

  it("never mentions common or leaked passwords", () => {
    expect(passwordGapMessage([])).not.toMatch(/common|leak/i);
  });
});
