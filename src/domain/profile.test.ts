import { describe, expect, it } from "vitest";
import { checkPasswordChange, normaliseOwnName, PROFILE_NAME_MAX } from "./profile";

const STRONG = "Correct-Horse-9";

describe("normaliseOwnName", () => {
  it("trims and collapses spaces", () => {
    expect(normaliseOwnName("  Ana   Reyes ")).toEqual({ ok: true, name: "Ana Reyes" });
  });

  it("refuses a blank name", () => {
    expect(normaliseOwnName("   ")).toEqual({ ok: false, error: "Enter your name." });
  });

  it("refuses a name over the limit, counted after tidying", () => {
    expect(normaliseOwnName("a".repeat(PROFILE_NAME_MAX)).ok).toBe(true);
    expect(normaliseOwnName(` ${"a".repeat(PROFILE_NAME_MAX)} `).ok).toBe(true);
    expect(normaliseOwnName("a".repeat(PROFILE_NAME_MAX + 1)).ok).toBe(false);
  });
});

describe("checkPasswordChange", () => {
  it("accepts a strong new password that matches and differs", () => {
    expect(checkPasswordChange("old-Password-1", STRONG, STRONG)).toEqual({ ok: true });
  });

  it("asks for the current password first", () => {
    expect(checkPasswordChange("", STRONG, STRONG)).toEqual({
      ok: false,
      error: "Enter your current password.",
    });
  });

  it("asks for a new password", () => {
    expect(checkPasswordChange("old", "", "")).toEqual({
      ok: false,
      error: "Enter a new password.",
    });
  });

  it("refuses a confirmation that does not match", () => {
    expect(checkPasswordChange("old", STRONG, `${STRONG}x`)).toEqual({
      ok: false,
      error: "The two passwords do not match.",
    });
  });

  it("names the rules a new password misses", () => {
    expect(checkPasswordChange("old", "short", "short")).toEqual({
      ok: false,
      error: "Use at least 12 characters, add an uppercase letter, add a number and add a symbol.",
    });
  });

  it("refuses the current password again", () => {
    expect(checkPasswordChange(STRONG, STRONG, STRONG)).toEqual({
      ok: false,
      error: "Choose a password different from your current one.",
    });
  });

  it("refuses a password longer than bcrypt reads", () => {
    const long = `${STRONG}${"a".repeat(80)}`;
    expect(checkPasswordChange("old", long, long)).toEqual({
      ok: false,
      error: "That password is too long. Use a shorter one.",
    });
  });
});
