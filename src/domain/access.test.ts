import { describe, expect, it } from "vitest";
import { accessLabel, isAllowed, resolveConsoleAccess } from "./access";

const membership = { organizationId: "org-1", organizationName: "Lab One" };

describe("resolveConsoleAccess", () => {
  it("makes profiles.role = admin a super admin", () => {
    expect(resolveConsoleAccess("admin", null)).toEqual({ kind: "super_admin" });
  });

  it("keeps a super admin a super admin even with a membership", () => {
    expect(resolveConsoleAccess("admin", membership)).toEqual({ kind: "super_admin" });
  });

  it("makes a medtech profile with an org-admin membership an org admin", () => {
    expect(resolveConsoleAccess("medtech", membership)).toEqual({
      kind: "org_admin",
      organizationId: "org-1",
      organizationName: "Lab One",
    });
  });

  it("gives a medtech with no org-admin membership no console access", () => {
    expect(resolveConsoleAccess("medtech", null)).toBeNull();
  });
});

describe("isAllowed", () => {
  it("admits only the listed kinds", () => {
    const orgAdmin = resolveConsoleAccess("medtech", membership)!;
    expect(isAllowed({ kind: "super_admin" }, ["super_admin"])).toBe(true);
    expect(isAllowed(orgAdmin, ["super_admin"])).toBe(false);
    expect(isAllowed(orgAdmin, ["super_admin", "org_admin"])).toBe(true);
  });
});

describe("accessLabel", () => {
  it("names both kinds", () => {
    expect(accessLabel({ kind: "super_admin" })).toBe("Super admin");
    expect(accessLabel(resolveConsoleAccess("medtech", membership)!)).toBe("Org admin");
  });
});
