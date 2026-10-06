import type { ConsoleAccess } from "./access";

/**
 * Laboratory organizations (Feature Specs §1; admin/0001).
 *
 * A super admin creates, renames and deactivates them. A user belongs to at most
 * one; "org admin" is a role on that membership. The organization owns its
 * patients. Nothing is ever deleted: deactivation locks an organization's admins
 * out and keeps every member, patient and record.
 */

export type OrganizationStatus = "active" | "deactivated";
export type MembershipRole = "org_admin" | "medtech";

/**
 * A role is a permission level, not a job: an org admin can do everything a medtech
 * can, plus administration (14zcqntkd0w).
 */
export const ROLE_LABEL: Record<MembershipRole, string> = {
  org_admin: "Organization admin",
  medtech: "Medtech",
};

export interface Organization {
  id: string;
  name: string;
  status: OrganizationStatus;
  createdAt: string;
  deactivatedAt: string | null;
}

/** An organization with how many people and patients it holds. */
export interface OrganizationSummary extends Organization {
  orgAdminCount: number;
  medtechCount: number;
  patientCount: number;
}

export interface OrganizationMember {
  userId: string;
  fullName: string | null;
  role: MembershipRole;
  status: OrganizationStatus;
  addedAt: string;
}

export interface OrganizationDetail extends OrganizationSummary {
  members: OrganizationMember[];
}

/**
 * Only a super admin manages organizations. The console asks this before every
 * organization write; the database function asks again (D7).
 */
export function canManageOrganizations(access: ConsoleAccess): boolean {
  return access.kind === "super_admin";
}

export const ORGANIZATION_NAME_MIN = 2;
export const ORGANIZATION_NAME_MAX = 120;

/**
 * A name as it will be stored: trimmed, inner runs of whitespace collapsed — the
 * same normalisation `console_create_organization` applies, so what the form
 * checks is what the database keeps.
 */
export function normaliseOrganizationName(
  input: string,
): { ok: true; name: string } | { ok: false; error: string } {
  const name = input.trim().replace(/\s+/g, " ");
  if (name.length < ORGANIZATION_NAME_MIN) {
    return { ok: false, error: `A name needs at least ${ORGANIZATION_NAME_MIN} characters.` };
  }
  if (name.length > ORGANIZATION_NAME_MAX) {
    return { ok: false, error: `A name can have at most ${ORGANIZATION_NAME_MAX} characters.` };
  }
  return { ok: true, name };
}

/** Org admins first, then medtechs; active before deactivated; then by name. */
export function sortMembers(members: readonly OrganizationMember[]): OrganizationMember[] {
  const roleRank: Record<MembershipRole, number> = { org_admin: 0, medtech: 1 };
  return [...members].sort(
    (left, right) =>
      roleRank[left.role] - roleRank[right.role] ||
      Number(left.status === "deactivated") - Number(right.status === "deactivated") ||
      (left.fullName ?? "").localeCompare(right.fullName ?? ""),
  );
}
