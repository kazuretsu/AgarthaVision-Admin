import type { ConsoleAccess } from "@/domain/access";
import type { SecondFactorStep } from "@/domain/second-factor";

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
  /**
   * The account has an authenticator app (14zcqntr31c), as the gate already learned it: a
   * session that passed a code has one, and one admitted without a code has none, since an
   * account with an app is held at `/verify`. No extra call. Feeds the notices (14zcqntr35f).
   */
  secondFactorOn: boolean;
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

/** A new authenticator app, waiting for its first code (14zcqntjnt0). */
export interface SecondFactorSetUp {
  /** Which set-up the first code confirms. Not a secret: it is useless without the session. */
  setUpId: string;
  /** The app's QR code, as an image URL the page can show. */
  qrCode: string;
  /** The same secret as text, for an app that cannot scan. */
  secret: string;
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
   * {@link NotAuthorizedError} when the user has no console access (a medtech),
   * {@link SecondFactorRequiredError} — a kind of {@link NotAuthenticatedError} — when the
   * account has an authenticator app and the session has not entered its code (14zcqntjnt0,
   * 14zcqntr31c; an account without one is admitted), and {@link AuthUnavailableError}
   * when access could not be read at all.
   */
  requireConsoleActor(): Promise<ConsoleActor>;

  /**
   * Where the signed-in console user stands on the second step. Throws as
   * {@link requireConsoleActor} does, except that a session short of the second step is
   * answered, not refused. A medtech is {@link NotAuthorizedError}: they are never asked.
   * `hasAuthenticator` is read from the auth server every time, so it is current even for a
   * session that passed before its app was reset.
   */
  secondFactorStatus(): Promise<{
    actor: ConsoleActor;
    step: SecondFactorStep;
    hasAuthenticator: boolean;
  }>;

  /**
   * Starts setting up an authenticator app, for a console user who has none. Throws
   * {@link SecondFactorError} when the provider refuses, including when one is already set up.
   */
  beginSecondFactorSetUp(): Promise<SecondFactorSetUp>;

  /**
   * Confirms a new app with its first code. On success the session has passed the second step.
   * Throws {@link SecondFactorError} for a wrong code.
   */
  confirmSecondFactorSetUp(setUpId: string, code: string): Promise<void>;

  /**
   * Checks a code from the app already set up. On success the session has passed the second
   * step. Throws {@link SecondFactorError} for a wrong code.
   */
  verifySecondFactor(code: string): Promise<void>;

  /**
   * Removes the account's authenticator app, after checking a current code from it, so a
   * session left open on a shared computer cannot. The next sign-in needs only the password.
   * Throws {@link SecondFactorError} for a wrong code, or when no app is set up.
   */
  turnOffSecondFactor(code: string): Promise<void>;

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

/**
 * A console user with an authenticator app whose session has not entered its code yet
 * (14zcqntjnt0). A kind of {@link NotAuthenticatedError}, so any caller that does not handle it
 * treats the session as signed out and shows and writes nothing. The gate sends them to
 * `/verify`.
 */
export class SecondFactorRequiredError extends NotAuthenticatedError {
  constructor(public readonly actor: ConsoleActor) {
    super();
    this.name = "SecondFactorRequiredError";
  }
}

/** Why the second step was refused. */
export type SecondFactorFailure =
  /** The code was wrong or expired. */
  | "rejected"
  /** Too many attempts; the provider is making them wait. */
  | "rate_limited"
  /** Anything else, including a set-up that is no longer pending. */
  | "failed";

/** The provider refused or failed a second-step request. */
export class SecondFactorError extends Error {
  constructor(
    public readonly reason: SecondFactorFailure,
    cause?: unknown,
  ) {
    super(`The second step failed: ${reason}.`);
    this.name = "SecondFactorError";
    this.cause = cause;
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
