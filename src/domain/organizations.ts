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
 * Unicode's default-ignorable code points (zero-width spaces and joiners, the byte-order
 * mark, bidirectional marks and isolates, soft hyphen, variation selectors, Hangul
 * fillers, tag characters) and control characters, except the tab, line breaks and NEL,
 * which become spaces. The same list as `console_clean_name` (admin/0016).
 */
const INVISIBLE =
  /[\u0000-\u0008\u000E-\u001F\u007F-\u0084\u0086-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF0-\uFFF8\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0000}-\u{E0FFF}]/gu;

/** Line breaks, tabs and every Unicode space, in runs. */
const SPACES = /[ \t\n\v\f\r\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/g;

/**
 * A name as the database stores it (14zcqntjw7v): Unicode NFKC, invisible and control
 * characters removed, spaces collapsed, ends trimmed. "Cebu Lab" with a zero-width space,
 * a no-break space or a full-width "Ｃ" is "Cebu Lab". Mirrors `console_clean_name`
 * (admin/0016) step for step; `supabase/tests/admin_0016_organization_name_cleanup.test.ts`
 * checks the two agree.
 */
export function cleanName(input: string): string {
  return input.normalize("NFKC").replace(INVISIBLE, "").replace(SPACES, " ").trim();
}

/**
 * A name as it will be stored ({@link cleanName}) — the same cleaning
 * `console_create_organization` applies, so what the form checks is what the database
 * keeps. Its length counts characters, as the database does, not UTF-16 units.
 */
export function normaliseOrganizationName(
  input: string,
): { ok: true; name: string } | { ok: false; error: string } {
  const name = cleanName(input);
  const length = [...name].length;
  if (length < ORGANIZATION_NAME_MIN) {
    return { ok: false, error: `A name needs at least ${ORGANIZATION_NAME_MIN} characters.` };
  }
  if (length > ORGANIZATION_NAME_MAX) {
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
