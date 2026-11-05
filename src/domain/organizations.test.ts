import { describe, expect, it } from "vitest";
import {
  canManageOrganizations,
  cleanName,
  normaliseOrganizationName,
  sortMembers,
} from "./organizations";

describe("canManageOrganizations", () => {
  it("admits a super admin only", () => {
    expect(canManageOrganizations({ kind: "super_admin" })).toBe(true);
    expect(
      canManageOrganizations({ kind: "org_admin", organizationId: "o", organizationName: "Lab" }),
    ).toBe(false);
  });
});

describe("normaliseOrganizationName", () => {
  it("trims and collapses whitespace, as the database does", () => {
    expect(normaliseOrganizationName("  Lab   A \n")).toEqual({ ok: true, name: "Lab A" });
  });

  it("refuses a name too short or too long", () => {
    expect(normaliseOrganizationName(" x ").ok).toBe(false);
    expect(normaliseOrganizationName("x".repeat(121)).ok).toBe(false);
    expect(normaliseOrganizationName("x".repeat(120)).ok).toBe(true);
  });
});

describe("cleanName (14zcqntjw7v)", () => {
  it.each([
    ["a zero-width space", "Cebu\u200B Lab"],
    ["a zero-width joiner", "Cebu\u200D Lab"],
    ["a byte-order mark", "\uFEFFCebu Lab"],
    ["a soft hyphen", "Ce\u00ADbu Lab"],
    ["a right-to-left override", "\u202ECebu Lab"],
    ["a word joiner", "Cebu\u2060 Lab"],
    ["a variation selector", "Cebu\uFE0F Lab"],
    ["a tag character", "Cebu Lab\u{E0041}"],
    ["a Hangul filler", "Cebu \u3164Lab"],
    ["a control character", "Cebu\u0007 Lab"],
    ["a no-break space", "Cebu\u00A0Lab"],
    ["an ideographic space", "Cebu\u3000Lab"],
    ["a line separator", "Cebu\u2028Lab"],
    ["a tab and a line break", " Cebu\t\n Lab "],
    ["full-width letters", "\uFF23\uFF45\uFF42\uFF55 Lab"],
  ])("reads a name with %s as the plain name", (_case, input) => {
    expect(cleanName(input)).toBe("Cebu Lab");
  });

  it("composes accents, so a decomposed é is the same name", () => {
    expect(cleanName("Cafe\u0301 Lab")).toBe("Caf\u00E9 Lab");
  });

  it("leaves letters in other scripts alone", () => {
    expect(cleanName("Laboratoryo ng Dumaguete — 第一")).toBe("Laboratoryo ng Dumaguete — 第一");
  });

  it("refuses a name that is only invisible characters", () => {
    expect(normaliseOrganizationName("\u200B\u200B\uFEFF").ok).toBe(false);
  });

  it("counts characters, not UTF-16 units, against the limit", () => {
    expect(normaliseOrganizationName("\u{1D400}".repeat(120)).ok).toBe(true);
  });
});

describe("sortMembers", () => {
  it("puts org admins first, active before deactivated, then by name", () => {
    const member = (fullName: string, role: "org_admin" | "medtech", status = "active") => ({
      userId: fullName,
      fullName,
      role,
      status: status as "active" | "deactivated",
      addedAt: "2026-09-01T00:00:00Z",
    });
    const sorted = sortMembers([
      member("Zed", "medtech"),
      member("Amy", "medtech", "deactivated"),
      member("Bob", "org_admin"),
      member("Ann", "medtech"),
    ]);
    expect(sorted.map((m) => m.fullName)).toEqual(["Bob", "Ann", "Zed", "Amy"]);
  });
});
