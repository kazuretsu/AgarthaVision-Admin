import { describe, expect, it } from "vitest";
import {
  assignableMedtechs,
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

describe("a patient keeps an active medtech", () => {
  it("only an active medtech of the laboratory covers a patient", () => {
    expect(isCovering(assignment({}))).toBe(true);
    expect(isCovering(assignment({ status: "deactivated" }))).toBe(false);
    expect(isCovering(assignment({ role: null, status: null }))).toBe(false);
  });

  it("the last active medtech cannot be removed, even with deactivated ones left", () => {
    const links = [
      assignment({ userId: "a" }),
      assignment({ userId: "off", status: "deactivated" }),
    ];
    expect(canRemoveAssignment(links, "a")).toBe(false);
    expect(canRemoveAssignment(links, "off")).toBe(true);
    expect(canRemoveAssignment([...links, assignment({ userId: "b" })], "a")).toBe(true);
  });
});

describe("assignableMedtechs", () => {
  it("offers active medtechs not yet assigned, by name", () => {
    const people = [
      person({ userId: "z", fullName: "Zed" }),
      person({ userId: "a", fullName: "Ana" }),
      person({ userId: "linked", fullName: "Linked" }),
      person({ userId: "off", fullName: "Off", status: "deactivated" }),
      person({ userId: "boss", fullName: "Boss", role: "org_admin" }),
    ];
    expect(assignableMedtechs(people, [{ userId: "linked" }]).map((p) => p.userId)).toEqual([
      "a",
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

  it("lists covering medtechs first", () => {
    const rows = sortAssignments([
      assignment({ userId: "off", fullName: "Aaa", status: "deactivated" }),
      assignment({ userId: "on", fullName: "Zzz" }),
    ]);
    expect(rows.map((row) => row.userId)).toEqual(["on", "off"]);
  });
});
