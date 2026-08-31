"use server";

import { redirect } from "next/navigation";
import { getAuth } from "@/adapters/registry";
import { AuthenticationFailedError, NotAuthorizedError } from "@/ports/auth";
import { MissingEnvironmentError } from "@/lib/env";
import type { LoginState } from "./state";

/**
 * Signs in, then admits only admins.
 *
 * A medtech with correct credentials is signed straight back out. Leaving the
 * session in place would mean a valid cookie for a console they may not use,
 * and every later guard would have to remember to re-check.
 *
 * Both failure modes return the same message. Distinguishing "wrong password"
 * from "not an admin" would confirm to an outsider which addresses are real
 * accounts, and to a medtech that the console exists at all.
 */
export async function signIn(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (email.length === 0 || password.length === 0) {
    return { error: "Enter both an email address and a password." };
  }

  try {
    const auth = await getAuth();
    const user = await auth.signInWithPassword({ email, password });
    if (user.role !== "admin") {
      await auth.signOut();
      return { error: "These credentials cannot access the admin console." };
    }
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return { error: `Server is not configured: ${cause.variable} is not set.` };
    }
    if (cause instanceof AuthenticationFailedError || cause instanceof NotAuthorizedError) {
      return { error: "These credentials cannot access the admin console." };
    }
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
  redirect("/login");
}
