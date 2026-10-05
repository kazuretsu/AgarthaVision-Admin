/**
 * Form state for deactivating and reactivating a medtech. Separate from
 * `actions.ts` because a `"use server"` module may export only async functions.
 */
export interface MemberFormState {
  error: string | null;
  done: string | null;
}

export const EMPTY_MEMBER_FORM: MemberFormState = { error: null, done: null };
