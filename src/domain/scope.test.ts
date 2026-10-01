import { describe, expect, it } from "vitest";
import { readScopeFor } from "./scope";

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
