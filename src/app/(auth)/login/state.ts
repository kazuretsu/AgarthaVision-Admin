/**
 * Form state for the sign-in action.
 *
 * Separate from `actions.ts` because a `"use server"` module may export only
 * async functions — a type and a constant living there fail the build.
 */

/** What the login form renders back to the visitor. */
export interface LoginState {
  error: string | null;
}

export const EMPTY_LOGIN_STATE: LoginState = { error: null };
