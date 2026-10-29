import type { AccountAccessPort } from "@/ports/account-access";
import type { AdminWritePort } from "@/ports/admin-write";

/**
 * Makes sign-in follow access after a change that takes it away or gives it back
 * (14zcqntnqpd): a laboratory deactivated or reactivated, a super admin revoked. The database
 * says whose sign-in to change and records each one first (admin/0021); this then blocks or
 * allows exactly those logins at the auth provider. A blocked login cannot sign in or refresh,
 * so the mobile app on that account is signed out within one access-token lifetime.
 *
 * Called after the change itself succeeded. A login the provider fails to change is counted,
 * logged and left recorded as attempted; the caller says so.
 */
export async function signInFollowsAccess(
  writes: Pick<AdminWritePort, "recordSignInChange">,
  access: Pick<AccountAccessPort, "setSignInAllowed">,
  userIds: readonly string[],
  block: boolean,
  cause: string,
): Promise<{ changed: number; failed: number }> {
  if (userIds.length === 0) return { changed: 0, failed: 0 };
  const logins = await writes.recordSignInChange(userIds, block, cause);
  let changed = 0;
  let failed = 0;
  for (const { accountId } of logins) {
    try {
      await access.setSignInAllowed(accountId, !block);
      changed++;
    } catch (cause) {
      console.error("Sign-in setting not changed", cause);
      failed++;
    }
  }
  return { changed, failed };
}
