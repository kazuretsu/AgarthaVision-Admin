"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAttemptLimit, getAuth } from "@/adapters/registry";
import {
  AuthUnavailableError,
  AuthenticationFailedError,
  HumanCheckFailedError,
  NotAuthorizedError,
  type AuthPort,
} from "@/ports/auth";
import { TOO_MANY_ATTEMPTS } from "@/domain/attempt-limits";
import { HUMAN_CHECK_FIELD, readHumanCheckToken } from "@/domain/human-check";
import { TooManyAttemptsError, clientIp, withAttemptLimit } from "@/lib/attempt-limit";
import { MissingEnvironmentError } from "@/lib/env";
import { CONSOLE_UNAVAILABLE } from "@/lib/unavailable";
import type { LoginState } from "./state";

/** Shown for bad credentials, and for any provider failure. */
const INVALID_CREDENTIALS = "These credentials cannot access the admin console.";

/** Shown when the human check is refused: about the check, never the password. */
const HUMAN_CHECK_FAILED =
  "The security check expired or did not pass. Complete it again, then sign in.";

/**
 * Shown only after the password was correct, so it tells the account holder
 * where to go without telling a stranger anything: nobody sees it who does not
 * already know the password.
 */
const MEDTECH_NOTICE =
  "This console is for super admins and organization admins. Medtechs use the AgarthaVision mobile app with the same email and password. If you manage a laboratory, ask an AgarthaVision super admin to check your access.";

/**
 * Signs in, then admits only people with console access.
 *
 * A medtech with correct credentials is signed straight back out. Leaving the
 * session in place would mean a valid cookie for a console they may not use, and
 * every later guard would have to remember to re-check.
 *
 * Under the attempt limits (14zcqntnqp6): after 5 wrong passwords for one email, or 20 from
 * one IP, within 15 minutes, the next attempt is refused before the auth provider is called.
 */
export async function signIn(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const humanCheckToken = readHumanCheckToken(formData.get(HUMAN_CHECK_FIELD));

  if (email.length === 0 || password.length === 0) {
    return { error: "Enter both an email address and a password." };
  }

  let auth: AuthPort | null = null;
  try {
    const signingIn = await getAuth();
    auth = signingIn;
    await withAttemptLimit(
      getAttemptLimit,
      { kind: "sign_in", email, ip: clientIp(await headers()), invitationToken: null },
      () => signingIn.signInWithPassword({ email, password, humanCheckToken }),
      (failure) => failure instanceof AuthenticationFailedError,
    );
  } catch (cause) {
    if (cause instanceof TooManyAttemptsError) return { error: TOO_MANY_ATTEMPTS };
    if (cause instanceof MissingEnvironmentError) {
      return { error: `Server is not configured: ${cause.variable} is not set.` };
    }
    if (cause instanceof NotAuthorizedError) {
      await auth?.signOut();
      return { error: MEDTECH_NOTICE };
    }
    if (cause instanceof HumanCheckFailedError) return { error: HUMAN_CHECK_FAILED };
    if (cause instanceof AuthenticationFailedError) return { error: INVALID_CREDENTIALS };
    if (cause instanceof AuthUnavailableError) {
      // The password was right but access could not be read (14zcqntk6h2): no session is
      // kept for a console nobody has checked them into, and nobody is told they are a medtech.
      console.error("console access could not be read at sign-in", cause.cause);
      await auth?.signOut();
      return { error: CONSOLE_UNAVAILABLE };
    }
    throw cause;
  }

  // Outside the try: redirect() signals by throwing, and catching it here would
  // swallow the navigation and leave the visitor on the form. An admin with an authenticator
  // app is sent on to `/verify` by the console gate (14zcqntjnt0); one without goes straight in.
  redirect("/dashboard");
}

/** Ends the session and returns to the sign-in form. */
export async function signOut(): Promise<void> {
  const auth = await getAuth();
  await auth.signOut();
  // Empty the browser's router cache (`staleTimes`, 14zcqntkd0y), so a page the person had
  // open can never be shown again from it on this browser, by Back or otherwise.
  revalidatePath("/", "layout");
  redirect("/login");
}
