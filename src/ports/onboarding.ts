import type { InvitationLink } from "@/domain/invitations";
import type { MembershipRole } from "@/domain/organizations";

/**
 * Accepting an invitation: the one path by which an account is made.
 *
 * Used by a visitor who has no account yet, so it is not behind the console gate.
 * Holding the link's token is the permission. The account is made for the
 * invitation's email only, and its role and organization come from the stored
 * invitation, never from anything the visitor sends.
 */
export interface AcceptInvitationRequest {
  token: string;
  password: string;
  fullName: string | null;
}

export interface OnboardingPort {
  /** What a link points at, or `null` when no invitation has this token. */
  findInvitation(token: string): Promise<InvitationLink | null>;

  /**
   * Makes the account (or signs in to the one already made for this email), joins
   * the organization the invitation names and leaves the invitee signed in. Throws
   * {@link AcceptInvitationError}.
   */
  acceptInvitation(request: AcceptInvitationRequest): Promise<{ role: MembershipRole }>;
}

export type AcceptInvitationFailure =
  | "invalid_link"
  | "expired"
  | "revoked"
  | "accepted"
  | "unavailable"
  | "wrong_password"
  | "weak_password"
  | "already_member"
  | "failed";

export class AcceptInvitationError extends Error {
  constructor(
    public readonly reason: AcceptInvitationFailure,
    cause?: unknown,
  ) {
    super(`Accepting the invitation failed: ${reason}.`);
    this.name = "AcceptInvitationError";
    this.cause = cause;
  }
}
