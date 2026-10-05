import type { ConsoleAccess } from "./access";
import { invitationState, type Invitation } from "./invitations";
import type { MembershipRole, OrganizationStatus } from "./organizations";

/**
 * A laboratory's people, as its Medtechs page lists them (admin/0006).
 *
 * The page shows the laboratory's medtechs together with the medtechs it has
 * invited who have not joined yet, so an org admin sees in one place who can
 * work, who cannot, and who is still to come. Deactivating a medtech blocks their
 * sign-in and deletes nothing (C8).
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

/** The medtechs and the open (pending or expired) medtech invitations, as one list. */
export function medtechRows(
  people: readonly Person[],
  invitations: readonly Invitation[],
  now: Date = new Date(),
): PeopleRow[] {
  const members: PeopleRow[] = people
    .filter((person) => person.role === "medtech")
    .map((person) => ({ kind: "member", key: person.userId, person, status: person.status }));
  const invited: PeopleRow[] = invitations
    .filter((invitation) => invitation.role === "medtech")
    .flatMap((invitation): PeopleRow[] => {
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

export const PEOPLE_SORTS = ["name", "email", "status", "joined", "patients"] as const;
export type PeopleSort = (typeof PEOPLE_SORTS)[number];
export type SortDirection = "asc" | "desc";

export function parsePeopleSort(value: string): PeopleSort {
  return (PEOPLE_SORTS as readonly string[]).includes(value) ? (value as PeopleSort) : "name";
}

export function parseSortDirection(value: string): SortDirection {
  return value === "desc" ? "desc" : "asc";
}

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

/** Who may open a laboratory's Medtechs page: its own org admin, or any super admin. */
export function canViewPeople(access: ConsoleAccess, organizationId: string): boolean {
  return access.kind === "super_admin" || access.organizationId === organizationId;
}

export const PERSON_STATUS_LABEL: Record<PersonStatus, string> = {
  active: "Active",
  deactivated: "Deactivated",
  invited: "Invited",
  invite_expired: "Invite expired",
};
