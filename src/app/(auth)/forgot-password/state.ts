/**
 * Form state for the forgot-password action (14zcqntjnt9).
 *
 * Separate from `actions.ts` because a `"use server"` module may export only
 * async functions.
 */

export interface ForgotPasswordState {
  sent: boolean;
  error: string | null;
}

export const EMPTY_FORGOT_PASSWORD_STATE: ForgotPasswordState = {
  sent: false,
  error: null,
};
