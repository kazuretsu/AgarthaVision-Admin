import type { SupabaseClient } from "@supabase/supabase-js";
import { AccountAccessError, type AccountAccessPort } from "@/ports/account-access";
import { createServiceClient } from "./client";

/**
 * Supabase implementation of {@link AccountAccessPort}: a ban, the provider's own
 * non-destructive way to stop a login. A banned user cannot sign in or refresh a
 * token, which is how the app learns to sign out and wipe the phone (SE2
 * 14zcqntjph8). Lifting the ban restores both. Needs the service-role client;
 * callers have checked the rule and the member first.
 */

/** A hundred years: Supabase has no "forever", only a duration. */
export const BAN_DURATION = "876000h";

export class SupabaseAccountAccessAdapter implements AccountAccessPort {
  constructor(private readonly service: () => SupabaseClient) {}

  async setSignInAllowed(accountId: string, allowed: boolean): Promise<void> {
    const { error } = await this.service().auth.admin.updateUserById(accountId, {
      ban_duration: allowed ? "none" : BAN_DURATION,
    });
    if (error) throw new AccountAccessError(error);
  }
}

export function createSupabaseAccountAccess(): AccountAccessPort {
  return new SupabaseAccountAccessAdapter(createServiceClient);
}
