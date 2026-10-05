/**
 * Whether a login may sign in at all — the auth provider's side of deactivating a
 * medtech. Blocking is reversible and deletes nothing: the account, the profile and
 * every record stay (C8). A blocked login can no longer sign in or refresh its
 * session, in the console or in the app; a session already open lasts until its
 * access token expires.
 */
export interface AccountAccessPort {
  setSignInAllowed(accountId: string, allowed: boolean): Promise<void>;
}

/** The provider refused or failed the change. */
export class AccountAccessError extends Error {
  constructor(cause?: unknown) {
    super("The sign-in setting could not be changed.");
    this.name = "AccountAccessError";
    this.cause = cause;
  }
}
