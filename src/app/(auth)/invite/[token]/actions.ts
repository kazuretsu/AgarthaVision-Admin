"use server";

import { redirect } from "next/navigation";
import { getAuth, getOnboarding } from "@/adapters/registry";
import { HUMAN_CHECK_FIELD, readHumanCheckToken } from "@/domain/human-check";
import { INVITEE_NAME_MAX, checkNewPassword, invitedToConsole } from "@/domain/invitations";
import { passwordGapMessage, passwordGaps } from "@/domain/password-policy";
import { AcceptInvitationError, type AcceptInvitationFailure } from "@/ports/onboarding";
import { MissingEnvironmentError } from "@/lib/env";
import type { AcceptState } from "./state";

const MESSAGES: Record<Exclude<AcceptInvitationFailure, "weak_password">, string> = {
  invalid_link: "This invitation link is not valid. Use the newest email you received.",
  expired: "This invitation has expired. Ask whoever invited you to send it again.",
  revoked: "This invitation was withdrawn. Ask whoever invited you if you still need access.",
  accepted: "This invitation has already been used. Sign in with the password you set.",
  unavailable: "This laboratory is not taking new members right now. Ask whoever invited you.",
  wrong_password:
    "This email already has an account. Enter that account's password to accept the invitation.",
  already_member: "This account already belongs to a laboratory, so it cannot join another.",
  human_check_failed:
    "The security check expired or did not pass. Complete it again, then set your password.",
  failed: "The invitation could not be accepted. Try again in a moment.",
};

/**
 * Sets the invitee's password and joins them to the invitation's organization.
 *
 * The token is the only thing that names the invitation. The email, role and
 * organization are read from the stored invitation by the adapter, never from
 * this form. An org admin or super admin lands in the console; a medtech is signed
 * out again and sent to `/invite/joined`, because their place is the mobile app.
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
  const humanCheckToken = readHumanCheckToken(formData.get(HUMAN_CHECK_FIELD));

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
    ({ role } = await (
      await getOnboarding()
    ).acceptInvitation({ token, password, fullName, humanCheckToken }));
  } catch (cause) {
    if (cause instanceof AcceptInvitationError) {
      // The provider says only that a rule was missed; the policy names which.
      const error =
        cause.reason === "weak_password"
          ? passwordGapMessage(passwordGaps(password))
          : MESSAGES[cause.reason];
      return { error, fullName: typedName };
    }
    if (cause instanceof MissingEnvironmentError) {
      return {
        error: `Server is not configured: ${cause.variable} is not set.`,
        fullName: typedName,
      };
    }
    throw cause;
  }

  // An org admin or super admin goes straight in; they can set up an authenticator app on
  // /settings (14zcqntr31c).
  if (invitedToConsole(role)) redirect("/dashboard");

  await (await getAuth()).signOut();
  redirect("/invite/joined");
}
