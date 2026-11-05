"use server";

import { revalidatePath } from "next/cache";
import { getAdminWrites, getDatabase, getMail } from "@/adapters/registry";
import {
  canInviteInto,
  canManageInvitation,
  invitableRole,
  isOpenInvitation,
  isUuid,
  normaliseInvitee,
  type ConsoleAccess,
  type Invitation,
  type MembershipRole,
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
import type { InvitationFormState } from "./state";

/**
 * Invite, re-send and revoke. Each checks the domain rule here first (D7); the
 * database function checks again and writes the audit row with the change. The
 * email goes out only after the invitation is saved, so a failed send leaves an
 * invitation that can be re-sent, never an email for an invitation that is not
 * there.
 */

const NOT_PERMITTED: InvitationFormState = {
  error: "You cannot manage this invitation.",
  done: null,
};

const NOT_FOUND: InvitationFormState = {
  error: "That invitation no longer exists.",
  done: null,
};

const SIGNED_OUT: InvitationFormState = {
  error: "Your session has ended. Sign in again to manage invitations.",
  done: null,
};

const NOT_SENT =
  "The invitation is saved, but the email could not be sent. Use Re-send to try again.";

/** The acting console user, or the state to return instead. */
async function requireActor(): Promise<ConsoleActor | InvitationFormState> {
  try {
    return await getConsoleActor();
  } catch (cause) {
    if (cause instanceof NotAuthenticatedError) return SIGNED_OUT;
    if (cause instanceof NotAuthorizedError) return NOT_PERMITTED;
    throw cause;
  }
}

function explain(cause: unknown): InvitationFormState {
  if (cause instanceof AdminWriteError) {
    if (cause.reason === "conflict") {
      return {
        error:
          cause.hint === "account_exists"
            ? "This email already has an account in a laboratory or with console access, so it cannot be invited."
            : "This email already has a pending invitation. Re-send or revoke that one.",
        done: null,
      };
    }
    if (cause.reason === "invalid") {
      const messages: Record<string, string> = {
        email: "Enter a valid email address.",
        name: "That name is too long.",
        accepted: "That invitation has already been accepted.",
        revoked: "That invitation was revoked.",
        too_soon:
          "That invitation was sent less than a minute ago. Wait a moment before re-sending.",
      };
      return {
        error: messages[cause.hint ?? ""] ?? "That value is not allowed.",
        done: null,
      };
    }
    const messages = {
      forbidden: NOT_PERMITTED.error,
      not_found: "That organization or invitation is not available.",
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
  invitation: { email: string; fullName: string | null; role: MembershipRole },
  organizationName: string,
  token: string,
  expiresAt: string,
): Promise<InvitationFormState | null> {
  try {
    const message = invitationEmail({
      to: invitation.email,
      fullName: invitation.fullName,
      role: invitation.role,
      organizationName,
      inviterName: actor.user.fullName?.trim() || actor.user.email || "An AgarthaVision admin",
      link: invitationLink(await consoleOrigin(), token),
      expiresAt,
    });
    await (await getMail()).send(message);
    return null;
  } catch (cause) {
    if (cause instanceof MailSendError || cause instanceof MissingEnvironmentError) {
      console.error("Invitation email not sent", cause);
      return { error: NOT_SENT, done: null };
    }
    throw cause;
  }
}

function refreshPages(organizationId: string) {
  revalidatePath(`/organizations/${organizationId}`);
  revalidatePath("/people");
}

/** The organization an invite goes into: an org admin's own, whatever the form says. */
function targetOrganization(access: ConsoleAccess, submitted: string): string | null {
  if (access.kind === "org_admin") return access.organizationId;
  return isUuid(submitted) ? submitted : null;
}

export async function inviteMember(
  _previous: InvitationFormState,
  formData: FormData,
): Promise<InvitationFormState> {
  const actor = await requireActor();
  if (!("user" in actor)) return actor;

  const organizationId = targetOrganization(
    actor.access,
    String(formData.get("organizationId") ?? ""),
  );
  if (!organizationId || !canInviteInto(actor.access, organizationId)) return NOT_PERMITTED;

  const values = {
    email: String(formData.get("email") ?? ""),
    fullName: String(formData.get("fullName") ?? ""),
  };
  const parsed = normaliseInvitee(values.email, values.fullName);
  if (!parsed.ok) return { error: parsed.error, done: null, values };

  let issued;
  let organizationName;
  try {
    issued = await (
      await getAdminWrites()
    ).invite({
      email: parsed.email,
      fullName: parsed.fullName,
      organizationId,
    });
    const saved = await (await getDatabase()).getInvitation(issued.invitationId);
    organizationName = saved?.organizationName ?? "";
  } catch (cause) {
    return { ...explain(cause), values };
  }
  refreshPages(organizationId);

  const role = invitableRole(actor.access);
  const failed = await sendLink(
    actor,
    { email: parsed.email, fullName: parsed.fullName, role },
    organizationName,
    issued.token,
    issued.expiresAt,
  );
  return failed ?? { error: null, done: `Invitation sent to ${parsed.email}.` };
}

/** The invitation named by the form, when this user may act on it. */
async function manageable(
  actor: ConsoleActor,
  formData: FormData,
): Promise<Invitation | InvitationFormState> {
  const id = String(formData.get("invitationId") ?? "");
  if (!isUuid(id)) return NOT_FOUND;
  const invitation = await (await getDatabase()).getInvitation(id);
  if (!invitation) return NOT_FOUND;
  if (!canManageInvitation(actor.access, invitation)) return NOT_PERMITTED;
  if (!isOpenInvitation(invitation)) {
    return {
      error:
        invitation.status === "accepted"
          ? "That invitation has already been accepted."
          : "That invitation was revoked.",
      done: null,
    };
  }
  return invitation;
}

export async function resendInvitation(
  _previous: InvitationFormState,
  formData: FormData,
): Promise<InvitationFormState> {
  const actor = await requireActor();
  if (!("user" in actor)) return actor;

  let invitation;
  let issued;
  try {
    const found = await manageable(actor, formData);
    if (!("id" in found)) return found;
    invitation = found;
    issued = await (await getAdminWrites()).resendInvitation(invitation.id);
  } catch (cause) {
    return explain(cause);
  }
  refreshPages(invitation.organizationId);

  const failed = await sendLink(
    actor,
    invitation,
    invitation.organizationName,
    issued.token,
    issued.expiresAt,
  );
  return failed ?? { error: null, done: `Invitation re-sent to ${invitation.email}.` };
}

export async function revokeInvitation(
  _previous: InvitationFormState,
  formData: FormData,
): Promise<InvitationFormState> {
  const actor = await requireActor();
  if (!("user" in actor)) return actor;

  let invitation;
  try {
    const found = await manageable(actor, formData);
    if (!("id" in found)) return found;
    invitation = found;
    await (await getAdminWrites()).revokeInvitation(invitation.id);
  } catch (cause) {
    return explain(cause);
  }
  refreshPages(invitation.organizationId);
  return { error: null, done: `Invitation to ${invitation.email} revoked.` };
}
