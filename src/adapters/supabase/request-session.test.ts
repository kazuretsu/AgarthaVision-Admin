import { describe, expect, it } from "vitest";
import { signedInAtFromClaims } from "./request-session";

describe("signedInAtFromClaims", () => {
  it("is the earliest sign-in method's time, in milliseconds", () => {
    expect(
      signedInAtFromClaims({
        amr: [
          { method: "totp", timestamp: 1_700_000_600 },
          { method: "password", timestamp: 1_700_000_000 },
        ],
      }),
    ).toBe(1_700_000_000_000);
  });

  it("is null when the token says nothing usable", () => {
    expect(signedInAtFromClaims({})).toBe(null);
    expect(signedInAtFromClaims({ amr: [] })).toBe(null);
    expect(signedInAtFromClaims({ amr: [{ method: "password", timestamp: "soon" }] })).toBe(null);
    expect(signedInAtFromClaims({ amr: "password" })).toBe(null);
  });
});
