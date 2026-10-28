/**
 * Form state for the code step (14zcqntjnt0). Separate from `actions.ts` because a
 * `"use server"` module may export only async functions. Success is a redirect.
 */
export interface VerifyState {
  error: string | null;
}

export const EMPTY_VERIFY_STATE: VerifyState = { error: null };
