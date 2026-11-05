/**
 * Whether a login may sign in at all — the auth provider's side of deactivating a
 * member, a medtech or an org admin. Blocking is reversible and deletes nothing:
 * the account, the profile and every record stay (C8). A blocked login can no
 * longer sign in or refresh its session, in the console or in the app; a session
 * already open lasts until its access token expires.
 */
export interface AccountAccessPort {
  setSignInAllowed(accountId: string, allowed: boolean): Promise<void>;

  /** Whether the login has a confirmed authenticator app (14zcqntjnt0). */
  hasAuthenticator(accountId: string): Promise<boolean>;

  /**
   * Removes the login's authenticator apps, for a lost phone (14zcqntjnt0). Their sessions drop
   * back to a password only, so the console asks them to set up a new app at their next page.
   * Nothing else about the account changes.
   */
  resetAuthenticator(accountId: string): Promise<void>;
}

/** The provider refused or failed the change or the read. */
export class AccountAccessError extends Error {
  constructor(cause?: unknown) {
    super("The sign-in setting could not be changed or read.");
    this.name = "AccountAccessError";
    this.cause = cause;
  }
}
