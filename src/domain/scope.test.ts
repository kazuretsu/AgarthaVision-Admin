import { describe, expect, it } from "vitest";
import { namesUnknownOrganization, readScopeFor } from "./scope";

const LAB_A = "11111111-1111-4111-8111-111111111111";
const LAB_B = "22222222-2222-4222-8222-222222222222";
const orgAdmin = { kind: "org_admin", organizationId: LAB_A, organizationName: "Lab A" } as const;

describe("readScopeFor", () => {
  it("holds an org admin to their own organization", () => {
    expect(readScopeFor(orgAdmin)).toEqual({ kind: "organization", organizationId: LAB_A });
  });

  it("ignores an org admin's request for another organization", () => {
    expect(readScopeFor(orgAdmin, LAB_B)).toEqual({ kind: "organization", organizationId: LAB_A });
  });

  it("gives a super admin everything by default", () => {
    expect(readScopeFor({ kind: "super_admin" })).toEqual({ kind: "all" });
  });

  it("narrows a super admin to the organization they ask for", () => {
    expect(readScopeFor({ kind: "super_admin" }, LAB_B)).toEqual({
      kind: "organization",
      organizationId: LAB_B,
    });
  });

  it("treats a malformed request as no request", () => {
    expect(readScopeFor({ kind: "super_admin" }, "lab-b")).toEqual({ kind: "all" });
  });
});

describe("namesUnknownOrganization (14zcqntjw7c)", () => {
  const listed = [{ id: LAB_A }];
  const superAdmin = { kind: "super_admin" } as const;

  it("is true for a super admin narrowed to an organization the list does not hold", () => {
    expect(namesUnknownOrganization(superAdmin, readScopeFor(superAdmin, LAB_B), listed)).toBe(
      true,
    );
  });

  it("is false for a listed organization, or for all of them", () => {
    expect(namesUnknownOrganization(superAdmin, readScopeFor(superAdmin, LAB_A), listed)).toBe(
      false,
    );
    expect(namesUnknownOrganization(superAdmin, readScopeFor(superAdmin), listed)).toBe(false);
    expect(namesUnknownOrganization(superAdmin, readScopeFor(superAdmin, "lab-b"), listed)).toBe(
      false,
    );
  });

  it("is never true for an org admin, whose list is not read", () => {
    expect(namesUnknownOrganization(orgAdmin, readScopeFor(orgAdmin, LAB_B), [])).toBe(false);
  });
});
