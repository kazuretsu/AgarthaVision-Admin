import type { SupabaseClient } from "@supabase/supabase-js";
import { AccountAccessError, type AccountAccessPort } from "@/ports/account-access";
import { createServiceClient } from "./client";

/**
 * Supabase implementation of {@link AccountAccessPort}: a ban, the provider's own
 * non-destructive way to stop a login, and the login's authenticator apps (14zcqntjnt0). A banned user cannot sign in or refresh a
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

  async hasAuthenticator(accountId: string): Promise<boolean> {
    const { data, error } = await this.service().auth.admin.mfa.listFactors({ userId: accountId });
    if (error) throw new AccountAccessError(error);
    return data.factors.some((factor) => factor.status === "verified");
  }

  /**
   * Deletes every factor the login has, confirmed or not. The provider downgrades the login's
   * sessions to a password only in the same step (`DowngradeSessionsToAAL1`), and the phone's
   * app session, never past a password, is untouched.
   */
  async resetAuthenticator(accountId: string): Promise<void> {
    const service = this.service();
    const { data, error } = await service.auth.admin.mfa.listFactors({ userId: accountId });
    if (error) throw new AccountAccessError(error);
    for (const factor of data.factors) {
      const deleted = await service.auth.admin.mfa.deleteFactor({
        id: factor.id,
        userId: accountId,
      });
      if (deleted.error) throw new AccountAccessError(deleted.error);
    }
  }
}

export function createSupabaseAccountAccess(): AccountAccessPort {
  return new SupabaseAccountAccessAdapter(createServiceClient);
}
