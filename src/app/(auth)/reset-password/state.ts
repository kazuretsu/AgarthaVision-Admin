/**
 * Form state for the reset-password action (14zcqntjnt9).
 *
 * Separate from `actions.ts` because a `"use server"` module may export only
 * async functions.
 */

export interface ResetPasswordState {
  done: boolean;
  linkInvalid: boolean;
  error: string | null;
}

export const EMPTY_RESET_PASSWORD_STATE: ResetPasswordState = {
  done: false,
  linkInvalid: false,
  error: null,
};

