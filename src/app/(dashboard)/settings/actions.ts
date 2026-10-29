"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminWrites, getAuth } from "@/adapters/registry";
import {
  checkPasswordChange,
  isUuid,
  normaliseOwnName,
  passwordGapMessage,
  passwordGaps,
  readSecondFactorCode,
  SECOND_FACTOR_CODE_FIELD,
} from "@/domain";
import { AdminWriteError } from "@/ports/admin-write";
import {
  NotAuthenticatedError,
  NotAuthorizedError,
  PasswordChangeError,
  SecondFactorError,
  SecondFactorRequiredError,
  type AuthPort,
  type PasswordChangeFailure,
} from "@/ports/auth";
import { getConsoleActor } from "@/lib/console-access";
import { CODE_FORMAT, secondFactorProblem } from "@/lib/second-factor-messages";
import type { AuthenticatorSetUpState, ProfileFormState, TurnOffState } from "./state";

/**
 * The cards on `/settings`: the admin's own name and password (14zcqntr35e), and the
 * authenticator app (14zcqntr31c). Each changes the signed-in admin's own account only.
 *
 * The authenticator card (14zcqntr31c): an admin sets up an app when they choose
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
  revalidatePath("/settings");
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
  revalidatePath("/settings");
  redirect("/settings");
}

/**
 * The signed-in console user, or the redirect for anyone who should not be here: no session to
 * `/login`, a session short of its code to `/verify`, a medtech to `/dashboard`.
 */
async function requireSelf(): Promise<void> {
  try {
    await getConsoleActor();
  } catch (cause) {
    if (cause instanceof SecondFactorRequiredError) redirect("/verify");
    if (cause instanceof NotAuthenticatedError) redirect("/login");
    if (cause instanceof NotAuthorizedError) redirect("/dashboard");
    throw cause;
  }
}

/** Changes the name the console shows for the signed-in admin. The database records it. */
export async function renameSelf(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const checked = normaliseOwnName(String(formData.get("fullName") ?? ""));
  if (!checked.ok) return { error: checked.error, done: null };

  await requireSelf();
  try {
    await (await getAdminWrites()).setOwnName(checked.name);
  } catch (cause) {
    if (cause instanceof AdminWriteError && cause.reason === "invalid") {
      return { error: "Enter a name of at most 120 characters.", done: null };
    }
    if (cause instanceof AdminWriteError && cause.reason === "forbidden") redirect("/dashboard");
    return { error: "Your name could not be saved. Try again in a moment.", done: null };
  }
  // The sidebar shows the name too.
  revalidatePath("/", "layout");
  return { error: null, done: "Your name is saved." };
}

const PASSWORD_REFUSED: Record<Exclude<PasswordChangeFailure, "weak_password">, string> = {
  wrong_current_password: "Your current password is not right. Nothing was changed.",
  same_password: "Choose a password different from your current one.",
  rate_limited: "Too many attempts. Wait a few minutes, then try again.",
  failed: "Your password could not be changed. Try again in a moment.",
};

/**
 * Changes the signed-in admin's password, after their current one. The provider then ends every
 * other session of the account, the mobile app's included; the form warned before sending.
 * This session stays signed in. The change is recorded after the provider accepts it.
 */
export async function changeOwnPassword(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const checked = checkPasswordChange(current, next, String(formData.get("confirmPassword") ?? ""));
  if (!checked.ok) return { error: checked.error, done: null };

  await requireSelf();
  try {
    await (await getAuth()).changePassword(current, next);
  } catch (cause) {
    if (cause instanceof PasswordChangeError) {
      // The provider says only that a rule was missed; the policy names which.
      const error =
        cause.reason === "weak_password"
          ? passwordGapMessage(passwordGaps(next))
          : PASSWORD_REFUSED[cause.reason];
      return { error, done: null };
    }
    throw cause;
  }

  const changed =
    "Your password is changed. Every other session, the mobile app's included, is signed out.";
  try {
    await (await getAdminWrites()).recordOwnPasswordChange();
  } catch {
    return {
      error: null,
      done: `${changed} The change could not be written to the audit trail.`,
    };
  }
  return { error: null, done: changed };
}
