/**
 * The authentication port.
 *
 * Identity and the admin decision both live behind this interface. Feature code
 * asks `requireAdmin()` and never inspects a cookie, a token or a provider
 * session object.
 */

export type UserRole = "medtech" | "admin";

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  fullName: string | null;
  /** Read from `profiles.role`. A client claim is never the authority. */
  role: UserRole;
}

export interface Credentials {
  email: string;
  password: string;
}

export interface AuthPort {
  /** The signed-in user, or `null` when there is no valid session. */
  getCurrentUser(): Promise<AuthenticatedUser | null>;

  /**
   * Returns the signed-in user when their role is `admin`.
   * Throws {@link NotAuthenticatedError} with no session, and
   * {@link NotAuthorizedError} when the session belongs to a medtech.
   */
  requireAdmin(): Promise<AuthenticatedUser>;

  signInWithPassword(credentials: Credentials): Promise<AuthenticatedUser>;

  signOut(): Promise<void>;
}

/** No session at all. The caller should send the visitor to sign in. */
export class NotAuthenticatedError extends Error {
  constructor() {
    super("No authenticated session.");
    this.name = "NotAuthenticatedError";
  }
}

/** A valid session that is not an admin. A medtech is not a partial admin. */
export class NotAuthorizedError extends Error {
  constructor(role: UserRole) {
    super(`Role "${role}" may not use the admin console.`);
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
