/**
 * Form state for the invitation actions. Separate from `actions.ts` because a
 * `"use server"` module may export only async functions.
 */
export interface InvitationFormState {
  error: string | null;
  /** Set after a successful write, for a short confirmation. */
  done: string | null;
  /**
   * What was typed, returned with a refusal so the form keeps it: React resets a form's
   * fields after its action, to their default values. Absent after a success.
   */
  values?: { email: string; fullName: string };
}

export const EMPTY_INVITATION_FORM: InvitationFormState = { error: null, done: null };
