import type { OrganizationStatus } from "@/domain/organizations";
import type { TrainingFilter, TrainingItem, TrainingSummary } from "@/domain/training-data";

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

export interface SuperAdminInviteRequest {
  email: string;
  fullName: string | null;
}

export interface TrainingSnapshotRequest {
  name: string;
  filter: TrainingFilter;
  summary: TrainingSummary;
  items: readonly TrainingItem[];
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
   * Invites a super admin (admin/0019). Super admins only. Refuses an email that already has
   * an account in a laboratory, is already a super admin, or has a live invitation of either
   * kind (`conflict`, hint `account_exists` or `invitation_pending`).
   */
  inviteSuperAdmin(request: SuperAdminInviteRequest): Promise<IssuedInvitation>;
  /** A new link and expiry for a pending super admin invitation; the old link stops working. */
  resendSuperAdminInvitation(invitationId: string): Promise<Omit<IssuedInvitation, "invitationId">>;
  /** Withdraws a pending super admin invitation. Nothing is deleted. */
  revokeSuperAdminInvitation(invitationId: string): Promise<void>;
  /**
   * Revokes a super admin's grant; the row stays, with who revoked it and when. Refused
   * (`forbidden`, hint `self`) for the caller's own grant, and (`invalid`, hint
   * `last_super_admin`) for the last one.
   */
  revokeSuperAdmin(userId: string): Promise<void>;

  /**
   * Records a member's membership as deactivated or active; an org admin's, super
   * admins only. Refused (`invalid`) with hint `last_org_admin` or `sole_cover` when
   * deactivating would leave the laboratory with no active org admin or a patient
   * with no active member. Blocking or allowing their sign-in is the caller's other
   * half ({@link AccountAccessPort}); this deletes nothing.
   */
  setMemberStatus(userId: string, status: OrganizationStatus): Promise<void>;

  /**
   * Records a super admin's reset of an org admin's authenticator app, about to happen
   * (14zcqntjnt0). Callers must not reset it if this throws: the reset itself is
   * {@link AccountAccessPort}'s, at the auth provider, after this.
   */
  recordAuthenticatorReset(userId: string): Promise<void>;

  /**
   * Records a sign-in change about to be made (admin/0021, 14zcqntnqpd) and returns the logins
   * it applies to: with `block`, those of `userIds` left with no access anywhere (no active
   * super admin grant, no active membership in an active laboratory); without, those with
   * access again. Super admins only. Callers then block or allow exactly these, through
   * {@link AccountAccessPort}; one that fails stays recorded as attempted.
   */
  recordSignInChange(
    userIds: readonly string[],
    block: boolean,
    cause: string,
  ): Promise<{ userId: string; accountId: string }[]>;

  /**
   * Sets the signed-in console user's own name (admin/0020, 14zcqntr35e): trimmed, inner spaces
   * collapsed, 1 to 120 characters. Refused (`invalid`, hint `name_required` or `name_too_long`)
   * for a bad name and (`forbidden`) for anyone but a super admin or an active org admin. The
   * same name again changes and records nothing.
   */
  setOwnName(fullName: string): Promise<void>;

  /**
   * Records that the signed-in console user just changed their own password (admin/0020). Called
   * after the provider accepted the change; nothing about the password is written.
   */
  recordOwnPasswordChange(): Promise<void>;

  /** Assigns a patient to an active medtech of its laboratory. Org admins only. */
  assignPatient(patientId: string, userId: string): Promise<void>;
  /**
   * Removes one assignment — access only, never a record. Refused (`invalid`, hint
   * `last_assignment`) when no other active medtech would remain.
   */
  unassignPatient(patientId: string, userId: string): Promise<void>;
  /** Hands a patient from one medtech to another in one step. */
  replaceAssignment(patientId: string, fromUserId: string, toUserId: string): Promise<void>;

  /**
   * Offboards a medtech (admin/0017): reassigns each specified patient to an active colleague,
   * ensures no patient is left with no active member, marks the member's status
   * as deactivated, and records the whole offboarding in the audit trail.
   */
  offboardMember(
    userId: string,
    reassignments: Array<{ patientId: string; toUserId: string }>,
  ): Promise<void>;

  /**
   * Freezes a training snapshot and returns its id. Super admins only. Refused
   * (`invalid`, hint `stale`) when a frame is no longer live: preview again.
   */
  createTrainingSnapshot(request: TrainingSnapshotRequest): Promise<string>;
  /**
   * Records a snapshot download about to be served (`not_found` for an unknown one).
   * Callers must not serve the file if this throws.
   */
  recordTrainingDownload(snapshotId: string): Promise<void>;
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
