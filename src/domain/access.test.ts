import { describe, expect, it } from "vitest";
import { accessLabel, isAllowed, patientDisclosureFor, resolveConsoleAccess } from "./access";

const membership = { organizationId: "org-1", organizationName: "Lab One" };

describe("resolveConsoleAccess", () => {
  it("makes an active super admin grant a super admin", () => {
    expect(resolveConsoleAccess(true, null)).toEqual({ kind: "super_admin" });
  });

  it("keeps a super admin a super admin even with a membership", () => {
    expect(resolveConsoleAccess(true, membership)).toEqual({ kind: "super_admin" });
  });

  it("makes someone with an org-admin membership and no grant an org admin", () => {
    expect(resolveConsoleAccess(false, membership)).toEqual({
      kind: "org_admin",
      organizationId: "org-1",
      organizationName: "Lab One",
    });
  });

  it("gives a medtech with no org-admin membership no console access", () => {
    expect(resolveConsoleAccess(false, null)).toBeNull();
  });
});

describe("isAllowed", () => {
  it("admits only the listed kinds", () => {
    const orgAdmin = resolveConsoleAccess(false, membership)!;
    expect(isAllowed({ kind: "super_admin" }, ["super_admin"])).toBe(true);
    expect(isAllowed(orgAdmin, ["super_admin"])).toBe(false);
    expect(isAllowed(orgAdmin, ["super_admin", "org_admin"])).toBe(true);
  });
});

describe("accessLabel", () => {
  it("names both kinds", () => {
    expect(accessLabel({ kind: "super_admin" })).toBe("Super admin");
    expect(accessLabel(resolveConsoleAccess(false, membership)!)).toBe("Organization admin");
  });
});

describe("patientDisclosureFor", () => {
  it("shows an organization admin their own clinic's patients identified", () => {
    expect(patientDisclosureFor(resolveConsoleAccess(false, membership)!)).toBe("identified");
  });

  it("keeps patient identity from a super admin", () => {
    expect(patientDisclosureFor({ kind: "super_admin" })).toBe("deidentified");
  });
});
