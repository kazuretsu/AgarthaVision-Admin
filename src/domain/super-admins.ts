import type { ConsoleAccess } from "./access";
import type { StoredInvitationStatus } from "./invitations";

/**
 * Super admins (D22, 14zcqntjwjg): who they are, and how one is added or removed.
 *
 * The first were granted by hand in the SQL editor. Every later one is invited by a super admin
 * from `/super-admins`, sets their own password from the emailed link, and is a super admin from
 * then on: a grant, never a laboratory membership. A super admin revokes another; nobody revokes
 * themselves, so the last one can never be removed. Every step is in the audit trail, under no
 * laboratory.
 *
 * These rules run in the console first (D7); the database functions (admin/0019) check them
 * again.
 */

/** An active super admin, as the list shows them. */
export interface SuperAdmin {
  userId: string;
  fullName: string | null;
  email: string | null;
  grantedAt: string;
  /** Null for a grant made by hand, before invitations existed. */
  grantedById: string | null;
  grantedByLabel: string | null;
}

export interface SuperAdminInvitation {
  id: string;
  email: string;
  fullName: string | null;
  status: StoredInvitationStatus;
  expiresAt: string;
  invitedAt: string;
  invitedById: string | null;
  sentCount: number;
  lastSentAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

/** How long a super admin invitation link works, as admin/0019 sets it. */
export const SUPER_ADMIN_INVITATION_HOURS = 72;

/** Inviting, re-sending, withdrawing and revoking are a super admin's alone. */
export function canManageSuperAdmins(access: ConsoleAccess): boolean {
  return access.kind === "super_admin";
}

/** Why a revocation is refused before it is tried, or `null` when it may go ahead. */
export type SuperAdminRevokeRefusal = "forbidden" | "self" | "last_super_admin";

/**
 * Whether this actor may revoke this super admin. Never themselves: so a super admin can never
 * remove the last one, since whoever revokes must stay. The count is of the active super admins
 * the actor's list shows; the database counts again under a lock.
 */
export function superAdminRevokeRefusal(
  access: ConsoleAccess,
  actorId: string,
  target: Pick<SuperAdmin, "userId">,
  activeCount: number,
): SuperAdminRevokeRefusal | null {
  if (!canManageSuperAdmins(access)) return "forbidden";
  if (target.userId === actorId) return "self";
  if (activeCount <= 1) return "last_super_admin";
  return null;
}
