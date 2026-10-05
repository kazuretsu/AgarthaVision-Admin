import { invitedRoleLabel } from "@/domain/invitations";
import type { MembershipRole } from "@/domain/organizations";
import type { MailMessage } from "@/ports/mail";
import { formatDateTime } from "./format";

/**
 * The invitation email. It carries the link and nothing secret: the invitee sets
 * their own password on the page the link opens.
 */
export interface InvitationEmailInput {
  to: string;
  fullName: string | null;
  role: MembershipRole;
  organizationName: string;
  inviterName: string;
  link: string;
  expiresAt: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** What the invitee will use once they are in. */
function nextStep(role: MembershipRole): string {
  return role === "org_admin"
    ? "You will then be signed in to the AgarthaVision Admin Console."
    : "You will then sign in to the AgarthaVision mobile app with this email and that password.";
}

export function invitationEmail(input: InvitationEmailInput): MailMessage {
  const greeting = input.fullName ? `Hello ${input.fullName},` : "Hello,";
  const role = invitedRoleLabel(input.role);
  const article = /^[aeiou]/i.test(role) ? "an" : "a";
  const invited = `${input.inviterName} invited you to join ${input.organizationName} on AgarthaVision as ${article} ${role}.`;
  const expires = `This link works until ${formatDateTime(input.expiresAt)} (Philippine time) and can be used once.`;
  const ignore =
    "If you did not expect this, ignore this email: no account is made until you open the link and set a password.";

  const text = [
    greeting,
    "",
    invited,
    "",
    "Open this link to set your own password:",
    input.link,
    "",
    nextStep(input.role),
    "",
    expires,
    ignore,
  ].join("\n");

  const html = `<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#2b2622;line-height:1.5">
<p>${escapeHtml(greeting)}</p>
<p>${escapeHtml(invited)}</p>
<p><a href="${escapeHtml(input.link)}" style="display:inline-block;padding:10px 18px;background:#8c1823;color:#ffffff;border-radius:8px;text-decoration:none">Set your password</a></p>
<p style="font-size:13px;color:#6b625b">Or paste this link into your browser:<br>${escapeHtml(input.link)}</p>
<p>${escapeHtml(nextStep(input.role))}</p>
<p style="font-size:13px;color:#6b625b">${escapeHtml(expires)}<br>${escapeHtml(ignore)}</p>
</body></html>`;

  return {
    to: input.to,
    subject: `You're invited to ${input.organizationName} on AgarthaVision`,
    text,
    html,
  };
}
