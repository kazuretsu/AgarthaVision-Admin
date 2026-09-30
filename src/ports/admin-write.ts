import type { OrganizationStatus } from "@/domain/organizations";

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
}

export type AdminWriteFailure = "forbidden" | "conflict" | "not_found" | "invalid" | "failed";

/** A refused or failed write, with the reason a caller can act on. */
export class AdminWriteError extends Error {
  constructor(
    public readonly reason: AdminWriteFailure,
    operation: string,
    cause?: unknown,
  ) {
    super(`Admin write ${operation} failed: ${reason}.`);
    this.name = "AdminWriteError";
    this.cause = cause;
  }
}
