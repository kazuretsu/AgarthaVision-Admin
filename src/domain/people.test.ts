import { describe, expect, it } from "vitest";
import type { ConsoleAccess } from "./access";
import type { Invitation } from "./invitations";
import {
  canChangeMemberStatus,
  canViewPeople,
  filterPeopleByRole,
  parsePeopleRole,
  peopleRows,
  parsePeopleSort,
  parseSortDirection,
  searchPeople,
  sortPeople,
  type Person,
} from "./people";

const NOW = new Date("2026-10-05T00:00:00Z");

function person(overrides: Partial<Person>): Person {
  return {
    userId: "u",
    accountId: "u",
    fullName: "Name",
    email: "name@example.test",
    role: "medtech",
    status: "active",
    addedAt: "2026-09-01T00:00:00Z",
    assignedPatients: 0,
    ...overrides,
  };
}

function invitation(overrides: Partial<Invitation>): Invitation {
  return {
    id: "i",
    organizationId: "lab-a",
    organizationName: "Lab A",
    email: "invitee@example.test",
    fullName: null,
    role: "medtech",
    status: "pending",
    expiresAt: "2026-10-10T00:00:00Z",
    invitedAt: "2026-10-03T00:00:00Z",
    invitedById: "a",
    sentCount: 1,
    lastSentAt: "2026-10-03T00:00:00Z",
    acceptedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

const ADMIN_A: ConsoleAccess = {
  kind: "org_admin",
  organizationId: "lab-a",
  organizationName: "A",
};
const SUPER: ConsoleAccess = { kind: "super_admin" };

describe("peopleRows", () => {
  it("lists every member and open invitation of either role, not closed invitations", () => {
    const rows = peopleRows(
      [person({ userId: "m" }), person({ userId: "a", role: "org_admin" })],
      [
        invitation({ id: "open" }),
        invitation({ id: "late", expiresAt: "2026-10-01T00:00:00Z" }),
        invitation({ id: "used", status: "accepted" }),
        invitation({ id: "gone", status: "revoked" }),
        invitation({ id: "boss", role: "org_admin" }),
      ],
      NOW,
    );
    expect(rows.map((row) => [row.key, row.status])).toEqual([
      ["m", "active"],
      ["a", "active"],
      ["open", "invited"],
      ["late", "invite_expired"],
      ["boss", "invited"],
    ]);
  });
});

describe("filterPeopleByRole", () => {
  const rows = peopleRows(
    [person({ userId: "m" }), person({ userId: "a", role: "org_admin" })],
    [invitation({ id: "inv-m" }), invitation({ id: "inv-a", role: "org_admin" })],
    NOW,
  );

  it("keeps one role, members and invitations alike", () => {
    expect(filterPeopleByRole(rows, "org_admin").map((row) => row.key)).toEqual(["a", "inv-a"]);
    expect(filterPeopleByRole(rows, "medtech").map((row) => row.key)).toEqual(["m", "inv-m"]);
    expect(filterPeopleByRole(rows, "all")).toHaveLength(4);
  });

  it("parses an unknown role to everyone", () => {
    expect(parsePeopleRole("org_admin")).toBe("org_admin");
    expect(parsePeopleRole("admin; drop")).toBe("all");
  });
});

describe("searchPeople", () => {
  const rows = peopleRows(
    [
      person({ userId: "1", fullName: "Ana Cruz", email: "ana@lab.test" }),
      person({ userId: "2", fullName: "Ben Uy", email: "ben@lab.test" }),
    ],
    [invitation({ email: "carla@lab.test" })],
    NOW,
  );

  it("matches name or email, ignoring case", () => {
    expect(searchPeople(rows, "  ANA ").map((row) => row.key)).toEqual(["1"]);
    expect(searchPeople(rows, "carla").map((row) => row.key)).toEqual(["i"]);
    expect(searchPeople(rows, "")).toHaveLength(3);
  });
});

describe("sortPeople", () => {
  const rows = peopleRows(
    [
      person({
        userId: "b",
        fullName: "Ben",
        assignedPatients: 5,
        addedAt: "2026-01-01T00:00:00Z",
      }),
      person({ userId: "a", fullName: "ana", assignedPatients: 2, status: "deactivated" }),
      person({ userId: "x", fullName: null, assignedPatients: 9 }),
      person({ userId: "o", fullName: "Olga", role: "org_admin" }),
    ],
    [],
    NOW,
  );

  it("by name, case-insensitive, unnamed last both ways", () => {
    expect(sortPeople(rows, "name", "asc").map((row) => row.key)).toEqual(["a", "b", "o", "x"]);
    expect(sortPeople(rows, "name", "desc").map((row) => row.key)).toEqual(["o", "b", "a", "x"]);
  });

  it("by patients and by status", () => {
    expect(sortPeople(rows, "patients", "desc").map((row) => row.key)).toEqual([
      "x",
      "b",
      "a",
      "o",
    ]);
    expect(sortPeople(rows, "status", "asc").at(-1)?.key).toBe("a");
  });

  it("by role: org admins first, then by name", () => {
    expect(sortPeople(rows, "role", "asc").map((row) => row.key)).toEqual(["o", "a", "b", "x"]);
    expect(sortPeople(rows, "role", "desc")[0]?.key).toBe("a");
  });

  it("parses unknown sorts and directions to the defaults", () => {
    expect(parsePeopleSort("drop table")).toBe("name");
    expect(parsePeopleSort("joined")).toBe("joined");
    expect(parseSortDirection("sideways")).toBe("asc");
  });
});

describe("who may change whom", () => {
  it("an org admin changes their own laboratory's medtechs, never themselves or an admin", () => {
    expect(canChangeMemberStatus(ADMIN_A, "me", "lab-a", { userId: "m", role: "medtech" })).toBe(
      true,
    );
    expect(canChangeMemberStatus(ADMIN_A, "me", "lab-b", { userId: "m", role: "medtech" })).toBe(
      false,
    );
    expect(canChangeMemberStatus(ADMIN_A, "me", "lab-a", { userId: "me", role: "medtech" })).toBe(
      false,
    );
    expect(canChangeMemberStatus(ADMIN_A, "me", "lab-a", { userId: "o", role: "org_admin" })).toBe(
      false,
    );
  });

  it("a super admin changes any laboratory's medtechs", () => {
    expect(canChangeMemberStatus(SUPER, "me", "lab-b", { userId: "m", role: "medtech" })).toBe(
      true,
    );
    expect(canChangeMemberStatus(SUPER, "me", "lab-b", { userId: "o", role: "org_admin" })).toBe(
      false,
    );
  });

  it("only a laboratory's own org admin, or a super admin, views its people", () => {
    expect(canViewPeople(ADMIN_A, "lab-a")).toBe(true);
    expect(canViewPeople(ADMIN_A, "lab-b")).toBe(false);
    expect(canViewPeople(SUPER, "lab-b")).toBe(true);
  });
});
