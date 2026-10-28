import type { SecondFactorSetUp } from "@/ports/auth";

/**
 * Form state for the authenticator card on `/settings` (14zcqntr31c). Separate from
 * `actions.ts` because a `"use server"` module may export only async functions.
 */
export interface AuthenticatorSetUpState {
  error: string | null;
  /** A set-up waiting for its first code; null before one starts or after it lapses. */
  setUp: SecondFactorSetUp | null;
}

export const EMPTY_SET_UP_STATE: AuthenticatorSetUpState = { error: null, setUp: null };

export interface TurnOffState {
  error: string | null;
}

export const EMPTY_TURN_OFF_STATE: TurnOffState = { error: null };
