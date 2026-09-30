import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrganizationStatus } from "@/domain/organizations";
import { AdminWriteError, type AdminWriteFailure, type AdminWritePort } from "@/ports/admin-write";
import { createRequestClient } from "./client";

/**
 * Supabase implementation of {@link AdminWritePort}.
 *
 * Each write is one call to a security-definer function from `admin/0001`, run as
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
    if (error) throw new AdminWriteError(reasonFor(error.code), fn, error);
    return data as T;
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
}

/** Builds the adapter against a request-scoped, session-carrying client. */
export async function createSupabaseAdminWrite(): Promise<AdminWritePort> {
  return new SupabaseAdminWriteAdapter(await createRequestClient());
}
