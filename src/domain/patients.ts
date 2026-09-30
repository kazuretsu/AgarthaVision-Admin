import type { Patient } from "./entities";

/**
 * How a patient is named and aged, the way the Android app does it
 * (`Patient.kt::displayName`, `ageYears`).
 */

/**
 * `"Cruz, Gerald M."` — surname, given name, middle initial. A codenamed patient
 * stores a blank first name and their codename in `lastname`, so they show as the
 * codename alone, with no dangling comma.
 */
export function patientDisplayName(
  patient: Pick<Patient, "lastname" | "firstname" | "middleName">,
): string {
  const lastname = patient.lastname.trim();
  const firstname = patient.firstname.trim();
  if (firstname.length === 0) return lastname;
  const initial = patient.middleName?.trim().charAt(0);
  return initial ? `${lastname}, ${firstname} ${initial}.` : `${lastname}, ${firstname}`;
}

/** True for a codenamed patient: no first name on record. */
export function isCodenamed(patient: Pick<Patient, "firstname">): boolean {
  return patient.firstname.trim().length === 0;
}

/**
 * Birthdates and "today" are read in one clinical frame, Asia/Manila, as the app
 * does. Comparing a Manila date with a UTC instant is the off-by-one that prints a
 * wrong age.
 */
const CLINICAL_ZONE = "Asia/Manila";

function manilaDate(instant: string | Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINICAL_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(typeof instant === "string" ? new Date(instant) : instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * Completed years of age at `asOf`, never negative. `birthdate` is a plain
 * `YYYY-MM-DD` date with no zone of its own.
 */
export function ageYears(birthdate: string, asOf: string | Date): number {
  const [year, month, day] = birthdate.split("-").map(Number);
  const today = manilaDate(asOf);
  let age = today.year - year;
  if (today.month < month || (today.month === month && today.day < day)) age -= 1;
  return Math.max(0, age);
}

/** The Manila calendar date of an instant, as `YYYY-MM-DD`. */
export function clinicalDate(instant: string): string {
  const { year, month, day } = manilaDate(instant);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
