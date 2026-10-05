import type { ConsoleAccess } from "./access";
import type { MembershipRole } from "./organizations";

/**
 * Invitations (admin/0005): the only way anyone gets an account.
 *
 * A super admin invites an **org admin** into an organization they choose; an org
 * admin invites a **medtech** into their own organization. The role and the
 * organization follow from who is inviting and are stored on the invitation —
 * the invitee never supplies either. The invitee opens the emailed link and sets
 * their own password; no password is ever sent.
 *
 * These rules run in the console first (D7); the database functions check them
 * again.
 */

/** What is stored. "Expired" is not: it is a pending invitation past its expiry. */
export type StoredInvitationStatus = "pending" | "accepted" | "revoked";

/** What a person sees. */
export type InvitationState = "pending" | "expired" | "accepted" | "revoked";

export interface Invitation {
  id: string;
  organizationId: string;
  organizationName: string;
  email: string;
  fullName: string | null;
  role: MembershipRole;
  status: StoredInvitationStatus;
  expiresAt: string;
  invitedAt: string;
  invitedById: string | null;
  sentCount: number;
  lastSentAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

export function invitationState(
  invitation: Pick<Invitation, "status" | "expiresAt">,
  now: Date = new Date(),
): InvitationState {
  if (invitation.status !== "pending") return invitation.status;
  return Date.parse(invitation.expiresAt) <= now.getTime() ? "expired" : "pending";
}

/** Who a console user may invite: a super admin invites org admins, an org admin medtechs. */
export function invitableRole(access: ConsoleAccess): MembershipRole {
  return access.kind === "super_admin" ? "org_admin" : "medtech";
}

/** A super admin invites into any organization; an org admin into their own only. */
export function canInviteInto(access: ConsoleAccess, organizationId: string): boolean {
  return access.kind === "super_admin" || access.organizationId === organizationId;
}

/**
 * Whether this user may re-send or revoke an invitation: a super admin, any; an
 * org admin, a medtech invitation into their own organization.
 */
export function canManageInvitation(
  access: ConsoleAccess,
  invitation: Pick<Invitation, "organizationId" | "role">,
): boolean {
  if (access.kind === "super_admin") return true;
  return invitation.role === "medtech" && invitation.organizationId === access.organizationId;
}

/** Only an invitation nobody has used or revoked can be re-sent or revoked. */
export function isOpenInvitation(invitation: Pick<Invitation, "status">): boolean {
  return invitation.status === "pending";
}

export const INVITEE_NAME_MAX = 120;

/** The same shape `console_invite` checks. Deliberately loose: the email itself proves it. */
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** An invitation as it will be stored: email trimmed and lower-cased, name spaced once. */
export function normaliseInvitee(
  email: string,
  fullName: string,
): { ok: true; email: string; fullName: string | null } | { ok: false; error: string } {
  const address = email.trim().toLowerCase();
  if (!EMAIL_SHAPE.test(address)) return { ok: false, error: "Enter a valid email address." };
  const name = fullName.trim().replace(/\s+/g, " ");
  if (name.length > INVITEE_NAME_MAX) {
    return { ok: false, error: `A name can have at most ${INVITEE_NAME_MAX} characters.` };
  }
  return { ok: true, email: address, fullName: name.length > 0 ? name : null };
}

export const PASSWORD_MIN = 8;
/** bcrypt, which Supabase Auth uses, reads only the first 72 bytes. */
export const PASSWORD_MAX_BYTES = 72;

/** The invitee's chosen password, checked before any account is made. */
export function checkNewPassword(
  password: string,
  confirmation: string,
): { ok: true } | { ok: false; error: string } {
  if (password.length < PASSWORD_MIN) {
    return { ok: false, error: `Use at least ${PASSWORD_MIN} characters.` };
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return { ok: false, error: "That password is too long. Use a shorter one." };
  }
  if (password !== confirmation) return { ok: false, error: "The two passwords do not match." };
  return { ok: true };
}

/** What a link resolves to on the accept page, before anyone has an account. */
export interface InvitationLink {
  email: string;
  fullName: string | null;
  role: MembershipRole;
  organizationName: string;
  /** `unavailable`: the organization was deactivated after the invitation was sent. */
  state: InvitationState | "unavailable";
  expiresAt: string;
}

/** How each role is named to the person invited. */
export function invitedRoleLabel(role: MembershipRole): string {
  return role === "org_admin" ? "organization admin" : "medtech";
}
