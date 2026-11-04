import type { ConsoleAccess } from "./access";

/**
 * A patient referral / share with another laboratory (admin/0023, 14zcqntjntd).
 *
 * A patient permanently belongs to one laboratory (D11). Only its owning
 * organization admin (or a super admin) can share the patient with another
 * laboratory with a stated reason, or revoke an active share.
 *
 * Receiving laboratories gain visibility of the patient and can assign their
 * own medtechs to it. When revoked, the receiving side loses access immediately.
 * Nothing is deleted.
 */

export interface PatientShare {
  id: string;
  patientId: string;
  sourceOrganizationId: string;
  sourceOrganizationName: string;
  targetOrganizationId: string;
  targetOrganizationName: string;
  sharedByName: string | null;
  shareReason: string;
  sharedAt: string;
  revokedByName: string | null;
  revocationReason: string | null;
  revokedAt: string | null;
}

/** Whether this share is currently active (not revoked). */
export function isShareActive(share: Pick<PatientShare, "revokedAt">): boolean {
  return share.revokedAt === null;
}

/**
 * Only the owning organization's admin or a super admin can share a patient.
 */
export function canSharePatient(access: ConsoleAccess, isOwningOrganization: boolean): boolean {
  if (access.kind === "super_admin") return true;
  if (access.kind === "org_admin") return isOwningOrganization;
  return false;
}

/**
 * Only the owning organization's admin or a super admin can revoke a patient share.
 */
export function canRevokeShare(access: ConsoleAccess, isOwningOrganization: boolean): boolean {
  if (access.kind === "super_admin") return true;
  if (access.kind === "org_admin") return isOwningOrganization;
  return false;
}

/** Stated reason cannot be empty and is capped at 500 characters. */
export function validateShareReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (trimmed.length === 0) return "Please provide a reason for sharing this patient.";
  if (trimmed.length > 500) return "Reason cannot exceed 500 characters.";
  return null;
}

/** Revocation reason cannot be empty and is capped at 500 characters. */
export function validateRevokeReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (trimmed.length === 0) return "Please provide a reason for revoking access.";
  if (trimmed.length > 500) return "Reason cannot exceed 500 characters.";
  return null;
}
