import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrganizationStatus } from "@/domain/organizations";
import {
  AdminWriteError,
  type AdminWriteFailure,
  type AdminWritePort,
  type InviteRequest,
  type IssuedInvitation,
} from "@/ports/admin-write";
import { createRequestClient } from "./client";

/**
 * Supabase implementation of {@link AdminWritePort}.
 *
 * Each write is one call to a security-definer function (`admin/0001`, `0003`, `0005`–`0007`), run as
 * the signed-in user. The function checks the caller, performs the write and
 * appends the audit row in one transaction, so a write without its audit entry
 * cannot happen. No table is written directly: the tables have no write policies.
 */

/** Postgres SQLSTATEs the functions raise, mapped to reasons a page can explain. */
function reasonFor(code: string | undefined): AdminWriteFailure {
  switch (code) {
    case "42501":
      return "forbidden";
    case "23505":
      return "conflict";
    case "P0002":
      return "not_found";
    case "23514":
    case "22023":
      return "invalid";
    default:
      return "failed";
  }
}

export class SupabaseAdminWriteAdapter implements AdminWritePort {
  constructor(private readonly client: SupabaseClient) {}

  private async call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.rpc(fn, args);
    if (error) throw new AdminWriteError(reasonFor(error.code), fn, error, error.hint || null);
    return data as T;
  }

  /** A set-returning function's single row. */
  private async callOne<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const rows = await this.call<T[] | null>(fn, args);
    const row = rows?.[0];
    if (!row) throw new AdminWriteError("failed", fn);
    return row;
  }

  async createOrganization(name: string): Promise<string> {
    return this.call<string>("console_create_organization", { p_name: name });
  }

  async renameOrganization(organizationId: string, name: string): Promise<void> {
    await this.call("console_rename_organization", { p_id: organizationId, p_name: name });
  }

  async setOrganizationStatus(organizationId: string, status: OrganizationStatus): Promise<void> {
    await this.call("console_set_organization_status", { p_id: organizationId, p_status: status });
  }

  async recordExport(
    organizationId: string | null,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.call("console_record_export", {
      p_organization_id: organizationId,
      p_details: details,
    });
  }

  async invite({ email, fullName, organizationId }: InviteRequest): Promise<IssuedInvitation> {
    const row = await this.callOne<{ invitation_id: string; token: string; expires_at: string }>(
      "console_invite",
      { p_email: email, p_full_name: fullName, p_organization_id: organizationId },
    );
    return { invitationId: row.invitation_id, token: row.token, expiresAt: row.expires_at };
  }

  async resendInvitation(invitationId: string): Promise<Omit<IssuedInvitation, "invitationId">> {
    const row = await this.callOne<{ token: string; expires_at: string }>(
      "console_resend_invitation",
      { p_id: invitationId },
    );
    return { token: row.token, expiresAt: row.expires_at };
  }

  async revokeInvitation(invitationId: string): Promise<void> {
    await this.call("console_revoke_invitation", { p_id: invitationId });
  }

  async setMemberStatus(userId: string, status: OrganizationStatus): Promise<void> {
    await this.call("console_set_member_status", { p_user: userId, p_status: status });
  }

  async assignPatient(patientId: string, userId: string): Promise<void> {
    await this.call("console_assign_patient", { p_patient: patientId, p_user: userId });
  }

  async unassignPatient(patientId: string, userId: string): Promise<void> {
    await this.call("console_unassign_patient", { p_patient: patientId, p_user: userId });
  }

  async replaceAssignment(patientId: string, fromUserId: string, toUserId: string): Promise<void> {
    await this.call("console_replace_assignment", {
      p_patient: patientId,
      p_from: fromUserId,
      p_to: toUserId,
    });
  }
}

/** Builds the adapter against a request-scoped, session-carrying client. */
export async function createSupabaseAdminWrite(): Promise<AdminWritePort> {
  return new SupabaseAdminWriteAdapter(await createRequestClient());
}
