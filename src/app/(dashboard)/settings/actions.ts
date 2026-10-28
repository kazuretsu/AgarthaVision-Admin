"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuth } from "@/adapters/registry";
import { isUuid, readSecondFactorCode, SECOND_FACTOR_CODE_FIELD } from "@/domain";
import {
  NotAuthenticatedError,
  NotAuthorizedError,
  SecondFactorError,
  type AuthPort,
} from "@/ports/auth";
import { CODE_FORMAT, secondFactorProblem } from "@/lib/second-factor-messages";
import type { AuthenticatorSetUpState, TurnOffState } from "./state";

/**
 * The authenticator card on `/settings` (14zcqntr31c): an admin sets up an app when they choose
 * to, and can turn it off again with a current code.
 *
 * Each action reads where the person stands first, so a medtech is never offered an app, an
 * account with an app cannot start a second one, and one without has nothing to turn off. The
 * provider enforces the second too: a new app needs a session that already passed the step.
 */

const EXPIRED = "This set-up expired. Start again.";

/** Whether the signed-in admin has an app, or the redirect for anyone who should not be here. */
async function hasAuthenticator(auth: AuthPort): Promise<boolean> {
  try {
    const status = await auth.secondFactorStatus();
    // An account with an app whose session has not entered its code belongs on `/verify`.
    if (status.step === "enter_code") redirect("/verify");
    return status.hasAuthenticator;
  } catch (cause) {
    if (cause instanceof NotAuthenticatedError) redirect("/login");
    if (cause instanceof NotAuthorizedError) redirect("/dashboard");
    throw cause;
  }
}

/**
 * Setting up an app, in two submissions of one form: the first (no `setUpId`) starts a set-up
 * and shows its QR code; the second confirms it with the app's first code, after which every
 * sign-in asks for a code. A mistyped code keeps the set-up on screen; one the provider no
 * longer has (it lapsed) goes back to the start.
 */
export async function setUpAuthenticator(
  previous: AuthenticatorSetUpState,
  formData: FormData,
): Promise<AuthenticatorSetUpState> {
  const setUpId = formData.get("setUpId");
  if (setUpId === null) return await start(previous);

  const id = String(setUpId);
  const code = readSecondFactorCode(formData.get(SECOND_FACTOR_CODE_FIELD));
  // A set-up id the form did not get from us is no set-up: start again.
  if (!isUuid(id) || previous.setUp?.setUpId !== id) return { error: EXPIRED, setUp: null };
  if (!code) return { error: CODE_FORMAT, setUp: previous.setUp };

  try {
    const auth = await getAuth();
    if (await hasAuthenticator(auth)) redirect("/settings");
    await auth.confirmSecondFactorSetUp(id, code);
  } catch (cause) {
    if (cause instanceof SecondFactorError && cause.reason === "failed") {
      return { error: EXPIRED, setUp: null };
    }
    return { error: secondFactorProblem(cause), setUp: previous.setUp };
  }
  // Outside the try: redirect() signals by throwing.
  // The whole console: the layout's notices change with it (14zcqntr35f).
  revalidatePath("/", "layout");
  redirect("/settings");
}

async function start(previous: AuthenticatorSetUpState): Promise<AuthenticatorSetUpState> {
  let setUp;
  try {
    const auth = await getAuth();
    // An app already set up is turned off first, never joined by a second.
    if (await hasAuthenticator(auth)) redirect("/settings");
    setUp = await auth.beginSecondFactorSetUp();
  } catch (cause) {
    return { error: secondFactorProblem(cause), setUp: previous.setUp };
  }
  return { error: null, setUp };
}

/** Removes the app, after a current code from it. The next sign-in asks for the password only. */
export async function turnOffAuthenticator(
  _previous: TurnOffState,
  formData: FormData,
): Promise<TurnOffState> {
  const code = readSecondFactorCode(formData.get(SECOND_FACTOR_CODE_FIELD));
  if (!code) return { error: CODE_FORMAT };

  try {
    const auth = await getAuth();
    if (!(await hasAuthenticator(auth))) redirect("/settings");
    await auth.turnOffSecondFactor(code);
  } catch (cause) {
    return { error: secondFactorProblem(cause) };
  }
  // The whole console: the layout's notices change with it (14zcqntr35f).
  revalidatePath("/", "layout");
  redirect("/settings");
}
