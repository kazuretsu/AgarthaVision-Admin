import type { OrganizationStatus } from "@/domain/organizations";

/** A link minted for an invitation. The token is returned once, to be emailed, and never stored. */
export interface IssuedInvitation {
  invitationId: string;
  token: string;
  expiresAt: string;
}

export interface InviteRequest {
  email: string;
  fullName: string | null;
  organizationId: string;
}

/**
 * The console's writes (D2).
 *
 * Separate from `DatabasePort`, which stays read-only by construction: clinical
 * data has no write verb anywhere. This port holds only administrative writes, and
 * every implementation must record each one in the audit trail in the same
 * transaction as the write itself.
 *
 * Callers check the domain rule (`canManageOrganizations`, …) first. The
 * implementation checks again and is the second line, never the only one.
 */
export interface AdminWritePort {
  /** Creates an organization and returns its id. */
  createOrganization(name: string): Promise<string>;
  renameOrganization(organizationId: string, name: string): Promise<void>;
  /** Deactivates or reactivates. Nothing is deleted either way. */
  setOrganizationStatus(organizationId: string, status: OrganizationStatus): Promise<void>;

  /**
   * Records a research export about to be handed out. The implementation files an
   * org admin's export under their own organization whatever is passed, so the
   * caller cannot misfile it. Callers must not serve the file if this throws.
   */
  recordExport(organizationId: string | null, details: Record<string, unknown>): Promise<void>;

  /**
   * Invites someone. The role follows from the caller (a super admin invites an org
   * admin, an org admin a medtech) and is never passed. Refuses an email that already
   * has an account or a live invitation (`conflict`, with a `hint` saying which).
   */
  invite(request: InviteRequest): Promise<IssuedInvitation>;
  /** Mints a new link and expiry for a pending invitation; the old link stops working. */
  resendInvitation(invitationId: string): Promise<Omit<IssuedInvitation, "invitationId">>;
  /** Withdraws a pending invitation. Nothing is deleted. */
  revokeInvitation(invitationId: string): Promise<void>;

  /**
   * Records a medtech's membership as deactivated or active. Blocking or allowing
   * their sign-in is the caller's other half ({@link AccountAccessPort}); this
   * deletes nothing.
   */
  setMemberStatus(userId: string, status: OrganizationStatus): Promise<void>;

  /** Assigns a patient to an active medtech of its laboratory. Org admins only. */
  assignPatient(patientId: string, userId: string): Promise<void>;
  /**
   * Removes one assignment — access only, never a record. Refused (`invalid`, hint
   * `last_assignment`) when no other active medtech would remain.
   */
  unassignPatient(patientId: string, userId: string): Promise<void>;
  /** Hands a patient from one medtech to another in one step. */
  replaceAssignment(patientId: string, fromUserId: string, toUserId: string): Promise<void>;
}

export type AdminWriteFailure = "forbidden" | "conflict" | "not_found" | "invalid" | "failed";

/** A refused or failed write, with the reason a caller can act on. */
export class AdminWriteError extends Error {
  constructor(
    public readonly reason: AdminWriteFailure,
    operation: string,
    cause?: unknown,
    /** Which case of the reason it was, when the implementation can tell (e.g. `account_exists`). */
    public readonly hint: string | null = null,
  ) {
    super(`Admin write ${operation} failed: ${reason}.`);
    this.name = "AdminWriteError";
    this.cause = cause;
  }
}
