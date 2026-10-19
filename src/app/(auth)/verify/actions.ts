"use server";

import { redirect } from "next/navigation";
import { getAuth } from "@/adapters/registry";
import { isUuid, readSecondFactorCode, SECOND_FACTOR_CODE_FIELD } from "@/domain";
import type { SecondFactorStep } from "@/domain/second-factor";
import {
  AuthUnavailableError,
  NotAuthenticatedError,
  NotAuthorizedError,
  SecondFactorError,
  type AuthPort,
  type SecondFactorFailure,
} from "@/ports/auth";
import { MissingEnvironmentError } from "@/lib/env";
import { CONSOLE_UNAVAILABLE } from "@/lib/unavailable";
import type { VerifyState } from "./state";

/**
 * The second step of signing in (14zcqntjnt0): set up an authenticator app, or enter its code.
 *
 * Each action asks where the person stands before doing anything, so a medtech is never offered
 * an app, a session that already passed goes on to the console, and someone with an app cannot
 * start a second one. The provider enforces the last too: a new app needs a session that already
 * passed the step.
 */

const CODE_FORMAT = "Enter the 6-digit code your authenticator app shows.";
const EXPIRED = "This set-up expired. Start again.";

const FAILURE: Record<SecondFactorFailure, string> = {
  rejected:
    "That code didn't match. Enter the code your app shows now; if it keeps failing, check that your phone sets its time automatically.",
  rate_limited: "Too many attempts. Wait a few minutes, then try again.",
  failed: "The code could not be checked. Try again.",
};

/** The step this session is on, or the redirect for anyone who should not be here. */
async function currentStep(auth: AuthPort): Promise<SecondFactorStep> {
  try {
    return (await auth.secondFactorStatus()).step;
  } catch (cause) {
    if (cause instanceof NotAuthenticatedError) redirect("/login");
    // The console gate shows a medtech where to go.
    if (cause instanceof NotAuthorizedError) redirect("/dashboard");
    throw cause;
  }
}

/** A refused request as the form shows it; anything unexpected is thrown on. */
function failed(cause: unknown, setUp: VerifyState["setUp"]): VerifyState {
  if (cause instanceof SecondFactorError) return { error: FAILURE[cause.reason], setUp };
  if (cause instanceof AuthUnavailableError) {
    console.error("second step could not be checked", cause.cause);
    return { error: CONSOLE_UNAVAILABLE, setUp };
  }
  if (cause instanceof MissingEnvironmentError) {
    return { error: `Server is not configured: ${cause.variable} is not set.`, setUp };
  }
  throw cause;
}

/**
 * Setting up an app, in two submissions of one form: the first (no `setUpId`) starts a set-up
 * and shows its QR code; the second confirms it with the app's first code, after which the
 * session has passed the step. A mistyped code keeps the set-up on screen; one the provider no
 * longer has (it lapsed) goes back to the start.
 */
export async function setUpAuthenticator(
  previous: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const setUpId = formData.get("setUpId");
  if (setUpId === null) return await start(previous);

  const id = String(setUpId);
  const code = readSecondFactorCode(formData.get(SECOND_FACTOR_CODE_FIELD));
  // A set-up id the form did not get from us is no set-up: start again.
  if (!isUuid(id) || previous.setUp?.setUpId !== id) return { error: EXPIRED, setUp: null };
  if (!code) return { error: CODE_FORMAT, setUp: previous.setUp };

  try {
    const auth = await getAuth();
    if ((await currentStep(auth)) !== "set_up") redirect("/verify");
    await auth.confirmSecondFactorSetUp(id, code);
  } catch (cause) {
    if (cause instanceof SecondFactorError && cause.reason === "failed") {
      return { error: EXPIRED, setUp: null };
    }
    return failed(cause, previous.setUp);
  }
  // Outside the try: redirect() signals by throwing.
  redirect("/dashboard");
}

async function start(previous: VerifyState): Promise<VerifyState> {
  let setUp;
  try {
    const auth = await getAuth();
    // Passed already: the page sends them on. An app already set up: the code form is the way
    // in, never a second app.
    if ((await currentStep(auth)) !== "set_up") redirect("/verify");
    setUp = await auth.beginSecondFactorSetUp();
  } catch (cause) {
    return failed(cause, previous.setUp);
  }
  return { error: null, setUp };
}

/** Checks the code from the app already set up. */
export async function verifyCode(_previous: VerifyState, formData: FormData): Promise<VerifyState> {
  const code = readSecondFactorCode(formData.get(SECOND_FACTOR_CODE_FIELD));
  if (!code) return { error: CODE_FORMAT, setUp: null };

  try {
    const auth = await getAuth();
    if ((await currentStep(auth)) !== "enter_code") redirect("/verify");
    await auth.verifySecondFactor(code);
  } catch (cause) {
    return failed(cause, null);
  }
  redirect("/dashboard");
}
