"use server";

import { redirect } from "next/navigation";
import { getAuth } from "@/adapters/registry";
import { readSecondFactorCode, SECOND_FACTOR_CODE_FIELD } from "@/domain";
import type { SecondFactorStep } from "@/domain/second-factor";
import { NotAuthenticatedError, NotAuthorizedError, type AuthPort } from "@/ports/auth";
import { CODE_FORMAT, secondFactorProblem } from "@/lib/second-factor-messages";
import type { VerifyState } from "./state";

/**
 * The second step of signing in (14zcqntjnt0): the code from the authenticator app already set
 * up. Setting one up happens on `/settings` (14zcqntr31c).
 *
 * The action asks where the person stands before doing anything, so a medtech is never asked and
 * a session with nothing to enter goes on to the console.
 */

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

/** Checks the code from the app already set up. */
export async function verifyCode(_previous: VerifyState, formData: FormData): Promise<VerifyState> {
  const code = readSecondFactorCode(formData.get(SECOND_FACTOR_CODE_FIELD));
  if (!code) return { error: CODE_FORMAT };

  try {
    const auth = await getAuth();
    if ((await currentStep(auth)) !== "enter_code") redirect("/verify");
    await auth.verifySecondFactor(code);
  } catch (cause) {
    return { error: secondFactorProblem(cause) };
  }
  redirect("/dashboard");
}
