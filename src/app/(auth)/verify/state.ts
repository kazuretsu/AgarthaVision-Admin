import type { SecondFactorSetUp } from "@/ports/auth";

/**
 * Form state for the second step (14zcqntjnt0). Separate from `actions.ts` because a
 * `"use server"` module may export only async functions.
 */
export interface VerifyState {
  error: string | null;
  /** A set-up waiting for its first code; null before one starts or after it lapses. */
  setUp: SecondFactorSetUp | null;
}

export const EMPTY_VERIFY_STATE: VerifyState = { error: null, setUp: null };
