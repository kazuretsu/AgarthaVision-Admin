import { describe, expect, it } from "vitest";
import { canManageSuperAdmins, superAdminRevokeRefusal } from "./super-admins";

const superAdmin = { kind: "super_admin" } as const;
const orgAdmin = { kind: "org_admin", organizationId: "org-1", organizationName: "Lab" } as const;

describe("canManageSuperAdmins", () => {
  it("is a super admin's alone", () => {
    expect(canManageSuperAdmins(superAdmin)).toBe(true);
    expect(canManageSuperAdmins(orgAdmin)).toBe(false);
  });
});

describe("superAdminRevokeRefusal", () => {
  it("lets a super admin revoke another while others remain", () => {
    expect(superAdminRevokeRefusal(superAdmin, "u-1", { userId: "u-2" }, 2)).toBeNull();
  });

  it("refuses an org admin", () => {
    expect(superAdminRevokeRefusal(orgAdmin, "u-1", { userId: "u-2" }, 3)).toBe("forbidden");
  });

  it("refuses revoking yourself, which also keeps the last one", () => {
    expect(superAdminRevokeRefusal(superAdmin, "u-1", { userId: "u-1" }, 3)).toBe("self");
    expect(superAdminRevokeRefusal(superAdmin, "u-1", { userId: "u-1" }, 1)).toBe("self");
  });

  it("refuses when the list shows one super admin left", () => {
    expect(superAdminRevokeRefusal(superAdmin, "u-1", { userId: "u-2" }, 1)).toBe(
      "last_super_admin",
    );
  });
});
