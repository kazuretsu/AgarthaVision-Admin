import type { ConsoleAccess } from "./access";
import type { MembershipRole, OrganizationStatus } from "./organizations";
import type { Person } from "./people";
import { patientDisplayName } from "./patients";

/**
 * Which medtechs a patient is assigned to (admin/0007, D12).
 *
 * A medtech sees a patient in the app only through an assignment (`patient_users`).
 * An org admin assigns their laboratory's patients to its active medtechs and
 * removes assignments; removing one only removes access and never touches the
 * patient, a record, or who authored it. A patient always keeps at least one
 * active medtech: the last one can only be replaced, not removed.
 */

export interface PatientAssignment {
  userId: string;
  fullName: string | null;
  /** Their membership in the patient's laboratory; null when they belong to none. */
  role: MembershipRole | null;
  status: OrganizationStatus | null;
  linkedAt: string;
}

/** One patient a member is assigned to, named only for a reader who may see names. */
export interface MemberPatient {
  patientId: string;
  /** Null for a super admin, who reads patients de-identified. */
  name: { lastname: string; firstname: string; middleName: string | null } | null;
  psgcBarangayCode: string;
  linkedAt: string;
}

/** Only a laboratory's own org admin assigns its patients; a super admin reads. */
export function canAssignPatients(access: ConsoleAccess): boolean {
  return access.kind === "org_admin";
}

/** An assignment that keeps the patient covered: an active medtech of the laboratory. */
export function isCovering(assignment: Pick<PatientAssignment, "role" | "status">): boolean {
  return assignment.role === "medtech" && assignment.status === "active";
}

/** Whether removing this person would still leave an active medtech on the patient. */
export function canRemoveAssignment(
  assignments: readonly PatientAssignment[],
  userId: string,
): boolean {
  return assignments.some((other) => other.userId !== userId && isCovering(other));
}

/** The laboratory's active medtechs not yet assigned, by name. */
export function assignableMedtechs(
  people: readonly Person[],
  assignments: readonly Pick<PatientAssignment, "userId">[],
): Person[] {
  const linked = new Set(assignments.map((assignment) => assignment.userId));
  return people
    .filter((p) => p.role === "medtech" && p.status === "active" && !linked.has(p.userId))
    .sort((left, right) =>
      (left.fullName ?? left.email ?? "").localeCompare(right.fullName ?? right.email ?? ""),
    );
}

export function memberPatientLabel(patient: MemberPatient): string {
  return patient.name
    ? patientDisplayName(patient.name)
    : `Patient ${patient.patientId.slice(0, 8)}`;
}

/** Covering medtechs first, then by name. */
export function sortAssignments(assignments: readonly PatientAssignment[]): PatientAssignment[] {
  return [...assignments].sort(
    (left, right) =>
      Number(isCovering(right)) - Number(isCovering(left)) ||
      (left.fullName ?? "").localeCompare(right.fullName ?? ""),
  );
}
