import { describe, expect, it } from "vitest";
import {
  assignableMembers,
  canAssignPatients,
  canRemoveAssignment,
  isCovering,
  memberPatientLabel,
  sortAssignments,
  type PatientAssignment,
} from "./assignments";
import type { Person } from "./people";

function assignment(overrides: Partial<PatientAssignment>): PatientAssignment {
  return {
    userId: "u",
    fullName: "Name",
    role: "medtech",
    status: "active",
    linkedAt: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

function person(overrides: Partial<Person>): Person {
  return {
    userId: "u",
    accountId: "u",
    fullName: "Name",
    email: "n@example.test",
    role: "medtech",
    status: "active",
    addedAt: "2026-09-01T00:00:00Z",
    assignedPatients: 0,
    ...overrides,
  };
}

describe("who assigns", () => {
  it("an org admin assigns; a super admin only reads", () => {
    expect(
      canAssignPatients({ kind: "org_admin", organizationId: "a", organizationName: "A" }),
    ).toBe(true);
    expect(canAssignPatients({ kind: "super_admin" })).toBe(false);
  });
});

describe("a patient keeps an active member", () => {
  it("an active member of the laboratory, in either role, covers a patient", () => {
    expect(isCovering(assignment({}))).toBe(true);
    expect(isCovering(assignment({ role: "org_admin" }))).toBe(true);
    expect(isCovering(assignment({ status: "deactivated" }))).toBe(false);
    expect(isCovering(assignment({ role: "org_admin", status: "deactivated" }))).toBe(false);
    expect(isCovering(assignment({ role: null, status: null }))).toBe(false);
  });

  it("a patient with an active org admin can lose its medtech", () => {
    const links = [
      assignment({ userId: "tech" }),
      assignment({ userId: "boss", role: "org_admin" }),
    ];
    expect(canRemoveAssignment(links, "tech")).toBe(true);
    expect(canRemoveAssignment(links.slice(1), "boss")).toBe(false);
  });

  it("the last active member cannot be removed, even with deactivated ones left", () => {
    const links = [
      assignment({ userId: "a" }),
      assignment({ userId: "off", status: "deactivated" }),
    ];
    expect(canRemoveAssignment(links, "a")).toBe(false);
    expect(canRemoveAssignment(links, "off")).toBe(true);
    expect(canRemoveAssignment([...links, assignment({ userId: "b" })], "a")).toBe(true);
  });
});

describe("assignableMembers", () => {
  it("offers active members of either role not yet assigned, by name", () => {
    const people = [
      person({ userId: "z", fullName: "Zed" }),
      person({ userId: "a", fullName: "Ana" }),
      person({ userId: "linked", fullName: "Linked" }),
      person({ userId: "off", fullName: "Off", status: "deactivated" }),
      person({ userId: "boss", fullName: "Boss", role: "org_admin" }),
      person({ userId: "gone", fullName: "Gone", role: "org_admin", status: "deactivated" }),
    ];
    expect(assignableMembers(people, [{ userId: "linked" }]).map((p) => p.userId)).toEqual([
      "a",
      "boss",
      "z",
    ]);
  });
});

describe("labels and order", () => {
  it("names a patient for an org admin and by record id for a super admin", () => {
    const base = { patientId: "70000000-aaaa", psgcBarangayCode: "0722217001", linkedAt: "x" };
    expect(
      memberPatientLabel({
        ...base,
        name: { lastname: "Cruz", firstname: "Ana", middleName: null },
      }),
    ).toBe("Cruz, Ana");
    expect(memberPatientLabel({ ...base, name: null })).toBe("Patient 70000000");
  });

  it("lists covering members first", () => {
    const rows = sortAssignments([
      assignment({ userId: "off", fullName: "Aaa", status: "deactivated" }),
      assignment({ userId: "on", fullName: "Zzz" }),
    ]);
    expect(rows.map((row) => row.userId)).toEqual(["on", "off"]);
  });
});
