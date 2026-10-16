import type { ConsoleAccess } from "@/domain/access";

/**
 * The authentication port.
 *
 * Identity and the console-access decision both live behind this interface.
 * Feature code asks `requireConsoleActor()` and never inspects a cookie, a token
 * or a provider session object.
 */

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  fullName: string | null;
  /**
   * An active grant in `super_admins`, read through `is_admin()`: the same check every
   * database policy makes. Never `profiles.role`, a JWT claim or `user_metadata`.
   */
  isSuperAdmin: boolean;
}

/** A signed-in user together with what they may do in the console. */
export interface ConsoleActor {
  user: AuthenticatedUser;
  access: ConsoleAccess;
}

export interface Credentials {
  email: string;
  password: string;
  /**
   * The single-use token from the sign-in form's human check (Cloudflare Turnstile,
   * 14zcqntnqpc), or none when the check is not configured. The provider verifies it; a
   * refused one is {@link HumanCheckFailedError}, never a wrong password.
   */
  humanCheckToken?: string;
}

export interface AuthPort {
  /**
   * The signed-in user, or `null` when there is no valid session. Throws
   * {@link AuthUnavailableError} when their access could not be read.
   */
  getCurrentUser(): Promise<AuthenticatedUser | null>;

  /**
   * The signed-in user and their console access, read server-side on every call.
   * Throws {@link NotAuthenticatedError} with no session,
   * {@link NotAuthorizedError} when the user has no console access (a medtech), and
   * {@link AuthUnavailableError} when access could not be read at all.
   */
  requireConsoleActor(): Promise<ConsoleActor>;

  /**
   * Signs in and returns the actor. Throws {@link AuthenticationFailedError} on
   * bad credentials and {@link NotAuthorizedError} when the credentials are
   * valid but carry no console access — the caller must then sign out. Throws
   * {@link AuthUnavailableError} when access could not be read.
   */
  signInWithPassword(credentials: Credentials): Promise<ConsoleActor>;

  signOut(): Promise<void>;
}

/** No session at all. The caller should send the visitor to sign in. */
export class NotAuthenticatedError extends Error {
  constructor() {
    super("No authenticated session.");
    this.name = "NotAuthenticatedError";
  }
}

/** A valid session with no console access. A medtech is not a partial admin. */
export class NotAuthorizedError extends Error {
  constructor(public readonly user: AuthenticatedUser) {
    super(`User ${user.id} has no console access.`);
    this.name = "NotAuthorizedError";
  }
}

/**
 * Access could not be read: the database did not answer, or answered with an error
 * (14zcqntk6h2). Not a refusal and not a grant. The caller shows no data and says the
 * console cannot reach its data, rather than telling an admin they have no access.
 */
export class AuthUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Console access could not be read.");
    this.name = "AuthUnavailableError";
    this.cause = cause;
  }
}

/**
 * The human check's token was missing, expired, already used or refused (14zcqntnqpc). Says
 * nothing about the password: the provider checks the token before it looks at credentials.
 */
export class HumanCheckFailedError extends Error {
  constructor(cause?: unknown) {
    super("The security check did not pass.");
    this.name = "HumanCheckFailedError";
    this.cause = cause;
  }
}

/** Sign-in failed: bad credentials, or the provider rejected the request. */
export class AuthenticationFailedError extends Error {
  constructor(cause?: unknown) {
    super("Sign-in failed. Check the email address and password.");
    this.name = "AuthenticationFailedError";
    this.cause = cause;
  }
}
