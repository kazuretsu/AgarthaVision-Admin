import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { signedOutPage } from "@/proxy";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("/verify/report is public; nothing else moved (14zcqnty9bj)", () => {
  it("AC1 lives outside the dashboard group, whose layout is the sign-in gate", () => {
    expect(existsSync(join(APP, "(public)", "verify", "report", "page.tsx"))).toBe(true);
    expect(existsSync(join(APP, "(dashboard)", "verify"))).toBe(false);
  });

  it("AC1 keeps every other unknown path behind the dashboard gate", () => {
    expect(existsSync(join(APP, "(dashboard)", "[...missing]"))).toBe(true);
    expect(existsSync(join(APP, "(public)", "[...missing]"))).toBe(false);
  });

  it("AC1 opens even when a console session has just ended", () => {
    expect(signedOutPage("/verify/report")).toBe(true);
    expect(signedOutPage("/verify")).toBe(false);
    expect(signedOutPage("/verify/report/other")).toBe(false);
    expect(signedOutPage("/dashboard")).toBe(false);
  });
});
