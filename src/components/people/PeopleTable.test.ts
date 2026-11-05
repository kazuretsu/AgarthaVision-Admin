import { describe, expect, it, vi } from "vitest";

// The row actions are client components bound to server actions; only the URL helper is
// under test here.
vi.mock("./MemberStatusForm", () => ({ MemberStatusForm: () => null }));
vi.mock("@/components/invitations/InvitationForms", () => ({ InvitationActions: () => null }));

const { peopleHref } = await import("./PeopleTable");

const BASE = { org: "", q: "", role: "all", sort: "name", dir: "asc", page: 1 } as const;

describe("peopleHref", () => {
  it("leaves defaults out of the URL", () => {
    expect(peopleHref(BASE)).toBe("/people");
  });

  it("keeps the search and organization when sorting or paging", () => {
    const query = { ...BASE, org: "lab-b", q: "ana cruz" };
    expect(peopleHref(query, { sort: "patients", dir: "desc", page: 1 })).toBe(
      "/people?org=lab-b&q=ana+cruz&sort=patients&dir=desc",
    );
    expect(peopleHref(query, { page: 3 })).toBe("/people?org=lab-b&q=ana+cruz&page=3");
  });

  it("keeps the role filter", () => {
    expect(peopleHref({ ...BASE, role: "org_admin" }, { sort: "joined" })).toBe(
      "/people?role=org_admin&sort=joined",
    );
  });
});
