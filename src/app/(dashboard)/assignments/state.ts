/**
 * Form state for the assignment actions. Separate from `actions.ts` because a
 * `"use server"` module may export only async functions.
 */
export interface AssignmentFormState {
  error: string | null;
  done: string | null;
}

export const EMPTY_ASSIGNMENT_FORM: AssignmentFormState = { error: null, done: null };
