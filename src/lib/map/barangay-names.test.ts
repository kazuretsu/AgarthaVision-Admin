import { describe, expect, it } from "vitest";
import { barangayNamesOf } from "./barangay-names";

describe("barangayNamesOf", () => {
  it("names every barangay of a town, from the 2Q 2026 release", async () => {
    const talisay = await barangayNamesOf("0702250000");
    expect(talisay.size).toBe(22);
    expect([...talisay.keys()].every((code) => code.startsWith("0702250"))).toBe(true);
  });

  it("holds the City of Manila's barangays, which sit under districts", async () => {
    const manila = await barangayNamesOf("1380600000");
    expect(manila.size).toBe(897);
    expect(manila.has("1380601001")).toBe(true);
  });

  it("knows a renumbered town only by its current code", async () => {
    expect((await barangayNamesOf("1804502000")).size).toBeGreaterThan(0);
    expect((await barangayNamesOf("0604502000")).size).toBe(0);
  });

  it("is empty for anything but a town code it holds", async () => {
    expect((await barangayNamesOf("9999999000")).size).toBe(0);
    expect((await barangayNamesOf("../../x")).size).toBe(0);
  });
});
