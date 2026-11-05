/**
 * Form state for accepting an invitation. Separate from `actions.ts` because a
 * `"use server"` module may export only async functions. Success is a redirect,
 * so the state only ever carries an error.
 */
export interface AcceptState {
  error: string | null;
  /**
   * The name as typed, so a refusal does not clear it: React resets a form's fields after
   * its action, to their default values.
   */
  fullName?: string;
}

export const EMPTY_ACCEPT_STATE: AcceptState = { error: null };
