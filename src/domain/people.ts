import type { ConsoleAccess } from "./access";
import { invitationState, type Invitation } from "./invitations";
import type { MembershipRole, OrganizationStatus } from "./organizations";

/**
 * A laboratory's people, as its People page lists them (admin/0006, 14zcqntkd0v).
 *
 * The page shows everyone in the laboratory — its org admins and its medtechs,
 * since both do fieldwork — together with the people it has invited who have not
 * joined yet, so an org admin sees in one place who can work, who cannot, and who
 * is still to come. Deactivating someone blocks their sign-in and deletes nothing
 * (C8).
 */

/** One member, with the sign-in email the console may show and their patient count. */
export interface Person {
  userId: string;
  /** The login this profile belongs to; null once the login was deleted (app 0011). */
  accountId: string | null;
  fullName: string | null;
  email: string | null;
  role: MembershipRole;
  status: OrganizationStatus;
  addedAt: string;
  /** How many of this laboratory's patients the person is linked to. */
  assignedPatients: number;
}

export type PersonStatus = "active" | "deactivated" | "invited" | "invite_expired";

export type PeopleRow =
  | { kind: "member"; key: string; person: Person; status: PersonStatus }
  | { kind: "invitation"; key: string; invitation: Invitation; status: PersonStatus };

/** Every member, either role, and the open (pending or expired) invitations, as one list. */
export function peopleRows(
  people: readonly Person[],
  invitations: readonly Invitation[],
  now: Date = new Date(),
): PeopleRow[] {
  const members: PeopleRow[] = people.map((person) => ({
    kind: "member",
    key: person.userId,
    person,
    status: person.status,
  }));
  const invited: PeopleRow[] = invitations.flatMap((invitation): PeopleRow[] => {
    const state = invitationState(invitation, now);
    if (state !== "pending" && state !== "expired") return [];
    return [
      {
        kind: "invitation",
        key: invitation.id,
        invitation,
        status: state === "pending" ? "invited" : "invite_expired",
      },
    ];
  });
  return [...members, ...invited];
}

/** The role they hold, or for an invitation, the role they were invited to. */
export function rowRole(row: PeopleRow): MembershipRole {
  return row.kind === "member" ? row.person.role : row.invitation.role;
}

export function rowName(row: PeopleRow): string | null {
  return row.kind === "member" ? row.person.fullName : row.invitation.fullName;
}

export function rowEmail(row: PeopleRow): string | null {
  return row.kind === "member" ? row.person.email : row.invitation.email;
}

/** When they joined; for an invitation, when it was sent. */
export function rowDate(row: PeopleRow): string {
  return row.kind === "member" ? row.person.addedAt : row.invitation.invitedAt;
}

export function rowPatients(row: PeopleRow): number | null {
  return row.kind === "member" ? row.person.assignedPatients : null;
}

/** Search by name or email, ignoring case and surrounding space. */
export function searchPeople(rows: readonly PeopleRow[], query: string): PeopleRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...rows];
  return rows.filter((row) =>
    [rowName(row), rowEmail(row)].some((value) => value?.toLowerCase().includes(needle)),
  );
}

/** The list's role filter, kept in the URL (`role`). */
export const PEOPLE_ROLE_FILTERS = ["all", "org_admin", "medtech"] as const;
export type PeopleRoleFilter = (typeof PEOPLE_ROLE_FILTERS)[number];

export function parsePeopleRole(value: string): PeopleRoleFilter {
  return (PEOPLE_ROLE_FILTERS as readonly string[]).includes(value)
    ? (value as PeopleRoleFilter)
    : "all";
}

export function filterPeopleByRole(
  rows: readonly PeopleRow[],
  role: PeopleRoleFilter,
): PeopleRow[] {
  return role === "all" ? [...rows] : rows.filter((row) => rowRole(row) === role);
}

export const PEOPLE_ROLE_FILTER_LABEL: Record<PeopleRoleFilter, string> = {
  all: "Everyone",
  org_admin: "Organization admins",
  medtech: "Medtechs",
};

export const PEOPLE_SORTS = ["name", "email", "role", "status", "joined", "patients"] as const;
export type PeopleSort = (typeof PEOPLE_SORTS)[number];
export type SortDirection = "asc" | "desc";

export function parsePeopleSort(value: string): PeopleSort {
  return (PEOPLE_SORTS as readonly string[]).includes(value) ? (value as PeopleSort) : "name";
}

export function parseSortDirection(value: string): SortDirection {
  return value === "desc" ? "desc" : "asc";
}

const ROLE_RANK: Record<MembershipRole, number> = { org_admin: 0, medtech: 1 };

const STATUS_RANK: Record<PersonStatus, number> = {
  active: 0,
  invited: 1,
  invite_expired: 2,
  deactivated: 3,
};

/** Unnamed people sort after named ones whichever way, so blanks never lead the list. */
function compareText(left: string | null, right: string | null, sign: 1 | -1 = 1): number {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return sign * left.localeCompare(right, "en", { sensitivity: "base" });
}

export function sortPeople(
  rows: readonly PeopleRow[],
  sort: PeopleSort,
  direction: SortDirection,
): PeopleRow[] {
  const sign: 1 | -1 = direction === "asc" ? 1 : -1;
  const by = (left: PeopleRow, right: PeopleRow): number => {
    switch (sort) {
      case "name":
        return compareText(rowName(left), rowName(right), sign);
      case "email":
        return compareText(rowEmail(left), rowEmail(right), sign);
      case "role":
        return sign * (ROLE_RANK[rowRole(left)] - ROLE_RANK[rowRole(right)]);
      case "status":
        return sign * (STATUS_RANK[left.status] - STATUS_RANK[right.status]);
      case "joined":
        return sign * (Date.parse(rowDate(left)) - Date.parse(rowDate(right)));
      case "patients":
        return sign * ((rowPatients(left) ?? -1) - (rowPatients(right) ?? -1));
    }
  };
  // Ties fall back to name, then email, so the order never shuffles between loads.
  return [...rows].sort(
    (left, right) =>
      by(left, right) ||
      compareText(rowName(left), rowName(right)) ||
      compareText(rowEmail(left), rowEmail(right)),
  );
}

/**
 * Whether this user may deactivate or reactivate this member: a medtech, never
 * themselves, and — for an org admin — only in their own laboratory. The database
 * function checks the same (D7).
 */
export function canChangeMemberStatus(
  access: ConsoleAccess,
  actorId: string,
  organizationId: string,
  person: Pick<Person, "userId" | "role">,
): boolean {
  if (person.role !== "medtech" || person.userId === actorId) return false;
  return access.kind === "super_admin" || access.organizationId === organizationId;
}

/** Who may open a laboratory's People page: its own org admin, or any super admin. */
export function canViewPeople(access: ConsoleAccess, organizationId: string): boolean {
  return access.kind === "super_admin" || access.organizationId === organizationId;
}

export const PERSON_STATUS_LABEL: Record<PersonStatus, string> = {
  active: "Active",
  deactivated: "Deactivated",
  invited: "Invited",
  invite_expired: "Invite expired",
};
