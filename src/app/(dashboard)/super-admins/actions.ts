"use server";

import { revalidatePath } from "next/cache";
import { getAdminWrites, getDatabase, getMail } from "@/adapters/registry";
import {
  canManageSuperAdmins,
  isOpenInvitation,
  isUuid,
  normaliseInvitee,
  superAdminRevokeRefusal,
  type SuperAdminInvitation,
} from "@/domain";
import {
  AdminWriteError,
  MailSendError,
  NotAuthenticatedError,
  NotAuthorizedError,
  type ConsoleActor,
} from "@/ports";
import { getConsoleActor } from "@/lib/console-access";
import { MissingEnvironmentError } from "@/lib/env";
import { invitationEmail } from "@/lib/invitation-email";
import { consoleOrigin, invitationLink } from "@/lib/site-url";
import type { InvitationFormState } from "../invitations/state";

/**
 * Inviting, re-sending, withdrawing and revoking super admins (14zcqntjwjg). Each checks the
 * domain rule here first (D7); the database function (admin/0019) checks again and writes the
 * audit row with the change. As with laboratory invitations, the email goes out only after the
 * invitation is saved.
 */

const PAGE = "/super-admins";

const NOT_PERMITTED: InvitationFormState = {
  error: "Only a super admin can manage super admins.",
  done: null,
};

const NOT_FOUND: InvitationFormState = {
  error: "That invitation no longer exists.",
  done: null,
};

const SIGNED_OUT: InvitationFormState = {
  error: "Your session has ended. Sign in again to manage super admins.",
  done: null,
};

const NOT_SENT =
  "The invitation is saved, but the email could not be sent. Use Re-send to try again.";

/** The acting super admin, or the state to return instead. */
async function requireSuperAdmin(): Promise<ConsoleActor | InvitationFormState> {
  let actor;
  try {
    actor = await getConsoleActor();
  } catch (cause) {
    if (cause instanceof NotAuthenticatedError) return SIGNED_OUT;
    if (cause instanceof NotAuthorizedError) return NOT_PERMITTED;
    throw cause;
  }
  return canManageSuperAdmins(actor.access) ? actor : NOT_PERMITTED;
}

const HINTS: Record<string, string> = {
  account_exists:
    "This email already has an account in a laboratory or is already a super admin, so it cannot be invited.",
  invitation_pending:
    "This email already has a pending invitation. Re-send or withdraw that one, or wait for it to expire.",
  email: "Enter a valid email address.",
  name: "That name is too long.",
  accepted: "That invitation has already been accepted.",
  revoked: "That invitation was withdrawn.",
  too_soon: "That invitation was sent less than a minute ago. Wait a moment before re-sending.",
  self: "You cannot revoke your own super admin access. Ask another super admin.",
  last_super_admin: "This is the last super admin, so their access cannot be revoked.",
};

function explain(cause: unknown): InvitationFormState {
  if (cause instanceof AdminWriteError) {
    const hinted = cause.hint ? HINTS[cause.hint] : undefined;
    if (hinted) return { error: hinted, done: null };
    const messages = {
      forbidden: NOT_PERMITTED.error,
      conflict: "That change conflicts with another one. Reload the page and try again.",
      not_found: "That person or invitation is not available.",
      invalid: "That value is not allowed.",
      failed: "The change could not be saved. Try again.",
    } as const;
    return { error: messages[cause.reason], done: null };
  }
  if (cause instanceof MissingEnvironmentError) {
    return { error: `Server is not configured: ${cause.variable} is not set.`, done: null };
  }
  throw cause;
}

/** Emails a freshly minted link. Returns the state to show when the send fails. */
async function sendLink(
  actor: ConsoleActor,
  invitation: { email: string; fullName: string | null },
  token: string,
  expiresAt: string,
): Promise<InvitationFormState | null> {
  try {
    const message = invitationEmail({
      to: invitation.email,
      fullName: invitation.fullName,
      role: "super_admin",
      organizationName: null,
      inviterName: actor.user.fullName?.trim() || actor.user.email || "An AgarthaVision admin",
      link: invitationLink(await consoleOrigin(), token),
      expiresAt,
    });
    await (await getMail()).send(message);
    return null;
  } catch (cause) {
    if (cause instanceof MailSendError || cause instanceof MissingEnvironmentError) {
      console.error("Super admin invitation email not sent", cause);
      return { error: NOT_SENT, done: null };
    }
    throw cause;
  }
}

export async function inviteSuperAdmin(
  _previous: InvitationFormState,
  formData: FormData,
): Promise<InvitationFormState> {
  const actor = await requireSuperAdmin();
  if (!("user" in actor)) return actor;

  const values = {
    email: String(formData.get("email") ?? ""),
    fullName: String(formData.get("fullName") ?? ""),
  };
  const parsed = normaliseInvitee(values.email, values.fullName);
  if (!parsed.ok) return { error: parsed.error, done: null, values };

  let issued;
  try {
    issued = await (
      await getAdminWrites()
    ).inviteSuperAdmin({ email: parsed.email, fullName: parsed.fullName });
  } catch (cause) {
    return { ...explain(cause), values };
  }
  revalidatePath(PAGE);

  const failed = await sendLink(actor, parsed, issued.token, issued.expiresAt);
  return failed ?? { error: null, done: `Invitation sent to ${parsed.email}.` };
}

/** The pending invitation the form names, or the state to return instead. */
async function openInvitation(
  formData: FormData,
): Promise<SuperAdminInvitation | InvitationFormState> {
  const id = String(formData.get("invitationId") ?? "");
  if (!isUuid(id)) return NOT_FOUND;
  const invitation = await (await getDatabase()).getSuperAdminInvitation(id);
  if (!invitation) return NOT_FOUND;
  if (!isOpenInvitation(invitation)) {
    return {
      error: HINTS[invitation.status] ?? "That invitation is closed.",
      done: null,
    };
  }
  return invitation;
}

export async function resendSuperAdminInvitation(
  _previous: InvitationFormState,
  formData: FormData,
): Promise<InvitationFormState> {
  const actor = await requireSuperAdmin();
  if (!("user" in actor)) return actor;

  let invitation;
  let issued;
  try {
    const found = await openInvitation(formData);
    if (!("id" in found)) return found;
    invitation = found;
    issued = await (await getAdminWrites()).resendSuperAdminInvitation(invitation.id);
  } catch (cause) {
    return explain(cause);
  }
  revalidatePath(PAGE);

  const failed = await sendLink(actor, invitation, issued.token, issued.expiresAt);
  return failed ?? { error: null, done: `Invitation re-sent to ${invitation.email}.` };
}

export async function withdrawSuperAdminInvitation(
  _previous: InvitationFormState,
  formData: FormData,
): Promise<InvitationFormState> {
  const actor = await requireSuperAdmin();
  if (!("user" in actor)) return actor;

  let invitation;
  try {
    const found = await openInvitation(formData);
    if (!("id" in found)) return found;
    invitation = found;
    await (await getAdminWrites()).revokeSuperAdminInvitation(invitation.id);
  } catch (cause) {
    return explain(cause);
  }
  revalidatePath(PAGE);
  return { error: null, done: `Invitation to ${invitation.email} withdrawn.` };
}

export async function revokeSuperAdmin(
  _previous: InvitationFormState,
  formData: FormData,
): Promise<InvitationFormState> {
  const actor = await requireSuperAdmin();
  if (!("user" in actor)) return actor;

  const userId = String(formData.get("userId") ?? "");
  if (!isUuid(userId)) return { error: "That person is not available.", done: null };

  let name;
  try {
    const superAdmins = await (await getDatabase()).listSuperAdmins();
    const target = superAdmins.find((person) => person.userId === userId);
    if (!target) return { error: "That person is not a super admin any more.", done: null };
    const refusal = superAdminRevokeRefusal(
      actor.access,
      actor.user.id,
      target,
      superAdmins.length,
    );
    if (refusal)
      return refusal === "forbidden" ? NOT_PERMITTED : { error: HINTS[refusal], done: null };
    name = target.fullName ?? target.email ?? "That super admin";
    await (await getAdminWrites()).revokeSuperAdmin(userId);
  } catch (cause) {
    return explain(cause);
  }
  revalidatePath(PAGE);
  return { error: null, done: `${name} is no longer a super admin.` };
}
