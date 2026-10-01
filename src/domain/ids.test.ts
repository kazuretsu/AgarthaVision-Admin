import { describe, expect, it } from "vitest";
import { isUuid } from "./ids";

describe("isUuid", () => {
  it("accepts a canonical uuid in either case", () => {
    expect(isUuid("3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c")).toBe(true);
    expect(isUuid("3F2B8C1E-9A4D-4E7B-8C2A-1D5E6F7A8B9C")).toBe(true);
  });

  it("rejects anything Postgres would refuse as a uuid", () => {
    expect(isUuid("-".repeat(36))).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("3f2b8c1e9a4d4e7b8c2a1d5e6f7a8b9c")).toBe(false);
    expect(isUuid("3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c ")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});
