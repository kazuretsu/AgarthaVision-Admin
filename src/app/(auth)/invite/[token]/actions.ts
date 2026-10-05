"use server";

import { redirect } from "next/navigation";
import { getAuth, getOnboarding } from "@/adapters/registry";
import { INVITEE_NAME_MAX, checkNewPassword } from "@/domain/invitations";
import { AcceptInvitationError, type AcceptInvitationFailure } from "@/ports/onboarding";
import { MissingEnvironmentError } from "@/lib/env";
import type { AcceptState } from "./state";

const MESSAGES: Record<AcceptInvitationFailure, string> = {
  invalid_link: "This invitation link is not valid. Use the newest email you received.",
  expired: "This invitation has expired. Ask whoever invited you to send it again.",
  revoked: "This invitation was withdrawn. Ask whoever invited you if you still need access.",
  accepted: "This invitation has already been used. Sign in with the password you set.",
  unavailable: "This laboratory is not taking new members right now. Ask whoever invited you.",
  wrong_password:
    "This email already has an account. Enter that account's password to accept the invitation.",
  weak_password: "Choose a stronger password: longer, and not a common one.",
  already_member: "This account already belongs to a laboratory, so it cannot join another.",
  failed: "The invitation could not be accepted. Try again in a moment.",
};

/**
 * Sets the invitee's password and joins them to the invitation's organization.
 *
 * The token is the only thing that names the invitation. The email, role and
 * organization are read from the stored invitation by the adapter, never from
 * this form. An org admin lands in the console; a medtech is signed out again and
 * sent to `/invite/joined`, because their place is the mobile app.
 */
export async function acceptInvitation(
  _previous: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmPassword") ?? "");
  const typedName = String(formData.get("fullName") ?? "");
  const fullName = typedName.trim().replace(/\s+/g, " ") || null;

  // Checked before the account is made: a refusal after it would leave a login that
  // joined nothing.
  if (fullName && fullName.length > INVITEE_NAME_MAX) {
    return {
      error: `A name can have at most ${INVITEE_NAME_MAX} characters.`,
      fullName: typedName,
    };
  }
  const checked = checkNewPassword(password, confirmation);
  if (!checked.ok) return { error: checked.error, fullName: typedName };

  let role;
  try {
    ({ role } = await (await getOnboarding()).acceptInvitation({ token, password, fullName }));
  } catch (cause) {
    if (cause instanceof AcceptInvitationError) {
      return { error: MESSAGES[cause.reason], fullName: typedName };
    }
    if (cause instanceof MissingEnvironmentError) {
      return {
        error: `Server is not configured: ${cause.variable} is not set.`,
        fullName: typedName,
      };
    }
    throw cause;
  }

  if (role === "org_admin") redirect("/dashboard");

  await (await getAuth()).signOut();
  redirect("/invite/joined");
}
