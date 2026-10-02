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
}

export interface AuthPort {
  /** The signed-in user, or `null` when there is no valid session. */
  getCurrentUser(): Promise<AuthenticatedUser | null>;

  /**
   * The signed-in user and their console access, read server-side on every call.
   * Throws {@link NotAuthenticatedError} with no session, and
   * {@link NotAuthorizedError} when the user has no console access (a medtech).
   */
  requireConsoleActor(): Promise<ConsoleActor>;

  /**
   * Signs in and returns the actor. Throws {@link AuthenticationFailedError} on
   * bad credentials and {@link NotAuthorizedError} when the credentials are
   * valid but carry no console access — the caller must then sign out.
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

/** Sign-in failed: bad credentials, or the provider rejected the request. */
export class AuthenticationFailedError extends Error {
  constructor(cause?: unknown) {
    super("Sign-in failed. Check the email address and password.");
    this.name = "AuthenticationFailedError";
    this.cause = cause;
  }
}
