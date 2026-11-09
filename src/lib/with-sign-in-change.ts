import { MissingEnvironmentError } from "@/lib/env";
import { AccountAccessError, type AccountAccessPort } from "@/ports/account-access";

/** Changes sign-in before the write and undoes the change if the write fails. */
export async function withSignInChange(
  accountId: string | null,
  allowed: boolean,
  getAccess: () => Promise<Pick<AccountAccessPort, "setSignInAllowed">>,
  write: () => Promise<void>,
): Promise<"sign_in_not_changed" | null> {
  if (!accountId) {
    await write();
    return null;
  }

  let access: Pick<AccountAccessPort, "setSignInAllowed">;
  try {
    access = await getAccess();
    await access.setSignInAllowed(accountId, allowed);
  } catch (cause) {
    if (!(cause instanceof AccountAccessError || cause instanceof MissingEnvironmentError)) {
      throw cause;
    }
    console.error("Sign-in setting not changed", cause);
    return "sign_in_not_changed";
  }

  try {
    await write();
  } catch (cause) {
    try {
      await access.setSignInAllowed(accountId, !allowed);
    } catch (undo) {
      console.error("Sign-in change not undone", undo);
    }
    throw cause;
  }
  return null;
}
