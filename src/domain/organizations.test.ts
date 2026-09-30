import { describe, expect, it } from "vitest";
import { canManageOrganizations, normaliseOrganizationName, sortMembers } from "./organizations";

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
