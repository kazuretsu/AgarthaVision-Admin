import { describe, expect, it } from "vitest";
import {
  ageYears,
  clinicalDate,
  isCodenamed,
  patientDisplayName,
  patientLabel,
  sessionLabel,
} from "./patients";

describe("patientDisplayName", () => {
  it("writes surname, given name and middle initial", () => {
    expect(
      patientDisplayName({ lastname: "Cruz", firstname: "Gerald", middleName: "Manalo" }),
    ).toBe("Cruz, Gerald M.");
  });

  it("drops the initial when there is no middle name", () => {
    expect(patientDisplayName({ lastname: "Cruz", firstname: "Gerald", middleName: null })).toBe(
      "Cruz, Gerald",
    );
  });

  it("shows a codenamed patient as the codename alone", () => {
    const codenamed = { lastname: "M24-001", firstname: "", middleName: null };
    expect(patientDisplayName(codenamed)).toBe("M24-001");
    expect(isCodenamed(codenamed)).toBe(true);
  });
});

describe("ageYears", () => {
  it("counts completed years only", () => {
    expect(ageYears("2000-06-15", "2026-06-14T12:00:00+08:00")).toBe(25);
    expect(ageYears("2000-06-15", "2026-06-15T12:00:00+08:00")).toBe(26);
  });

  it("reads today in Manila, not UTC", () => {
    // 2026-06-14T17:00Z is already 15 June in Manila.
    expect(ageYears("2000-06-15", "2026-06-14T17:00:00Z")).toBe(26);
  });

  it("never returns a negative age", () => {
    expect(ageYears("2030-01-01", "2026-01-01T00:00:00Z")).toBe(0);
  });
});

describe("clinicalDate", () => {
  it("gives the Manila calendar date", () => {
    expect(clinicalDate("2026-09-01T17:30:00Z")).toBe("2026-09-02");
  });
});

describe("patientLabel", () => {
  const id = "1a2b3c4d-0000-4000-8000-000000000000";

  it("names an identified patient", () => {
    const identity = {
      lastname: "Cruz",
      firstname: "Gerald",
      middleName: null,
      sex: "M" as const,
      birthdate: "2015-01-01",
    };
    expect(patientLabel({ id, identity })).toBe("Cruz, Gerald");
  });

  it("gives a de-identified patient their short record id, not a name", () => {
    expect(patientLabel({ id, identity: null })).toBe("Patient 1a2b3c4d");
  });
});

describe("sessionLabel", () => {
  const id = "5e6f7a8b-0000-4000-8000-000000000000";

  it("uses the app's label for an identified reader", () => {
    expect(sessionLabel({ id, label: "C.G.-0730600000-001" }, "identified")).toBe(
      "C.G.-0730600000-001",
    );
    expect(sessionLabel({ id, label: null }, "identified")).toBe("Untitled session");
  });

  it("never shows a de-identified reader the label, which carries initials", () => {
    expect(sessionLabel({ id, label: "C.G.-0730600000-001" }, "deidentified")).toBe(
      "Session 5e6f7a8b",
    );
  });
});
