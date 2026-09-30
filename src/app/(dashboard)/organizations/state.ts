/**
 * Form state for the organization actions. Separate from `actions.ts` because a
 * `"use server"` module may export only async functions.
 */
export interface OrganizationFormState {
  error: string | null;
  /** Set after a successful write, for a short confirmation. */
  done: string | null;
}

export const EMPTY_ORGANIZATION_FORM: OrganizationFormState = { error: null, done: null };
