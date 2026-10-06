"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuth } from "@/adapters/registry";
import { AuthenticationFailedError, NotAuthorizedError, type AuthPort } from "@/ports/auth";
import { MissingEnvironmentError } from "@/lib/env";
import type { LoginState } from "./state";

/** Shown for bad credentials, and for any provider failure. */
const INVALID_CREDENTIALS = "These credentials cannot access the admin console.";

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
 */
export async function signIn(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (email.length === 0 || password.length === 0) {
    return { error: "Enter both an email address and a password." };
  }

  let auth: AuthPort | null = null;
  try {
    auth = await getAuth();
    await auth.signInWithPassword({ email, password });
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return { error: `Server is not configured: ${cause.variable} is not set.` };
    }
    if (cause instanceof NotAuthorizedError) {
      await auth?.signOut();
      return { error: MEDTECH_NOTICE };
    }
    if (cause instanceof AuthenticationFailedError) return { error: INVALID_CREDENTIALS };
    throw cause;
  }

  // Outside the try: redirect() signals by throwing, and catching it here would
  // swallow the navigation and leave the visitor on the form.
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
