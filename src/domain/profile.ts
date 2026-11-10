/**
 * A console user's own profile on Settings (14zcqntr35e) and password recovery on the sign-in
 * pages (14zcqntjnt9): the name the console shows for them, and a new password. Pure checks
 * made before anything is sent; the database (admin/0020) and the auth provider check again
 * and have the last word.
 */
import { checkNewPassword } from "./invitations";
import { passwordGapMessage, passwordGaps } from "./password-policy";

/** The longest name `console_set_own_name` stores, as for an invitee. */
export const PROFILE_NAME_MAX = 120;

/** The same loose email shape `normaliseInvitee` checks; the reset email itself proves it. */
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** A name as it will be stored: trimmed, inner spaces collapsed, never empty. */
export function normaliseOwnName(
  typed: string,
): { ok: true; name: string } | { ok: false; error: string } {
  const name = typed.trim().replace(/\s+/g, " ");
  if (name.length === 0) return { ok: false, error: "Enter your name." };
  if (name.length > PROFILE_NAME_MAX) {
    return { ok: false, error: `A name can have at most ${PROFILE_NAME_MAX} characters.` };
  }
  return { ok: true, name };
}

/**
 * An email entered on `/forgot-password` (14zcqntjnt9): trimmed, lower-cased and checked for
 * basic shape before the provider is asked.
 */
export function normaliseResetEmail(
  typed: string,
): { ok: true; email: string } | { ok: false; error: string } {
  const email = typed.trim().toLowerCase();
  if (!EMAIL_SHAPE.test(email)) return { ok: false, error: "Enter a valid email address." };
  return { ok: true, email };
}

/**
 * What is checked before the provider is asked to reset a forgotten password (14zcqntjnt9):
 * the new password is given, fits bcrypt, matches its confirmation and meets the rules.
 */
export function checkPasswordReset(
  next: string,
  confirmation: string,
): { ok: true } | { ok: false; error: string } {
  const checked = checkNewPassword(next, confirmation);
  if (!checked.ok) {
    return checked.error === "Enter a password."
      ? { ok: false, error: "Enter a new password." }
      : checked;
  }
  const gaps = passwordGaps(next);
  if (gaps.length > 0) return { ok: false, error: passwordGapMessage(gaps) };
  return { ok: true };
}

/**
 * What is checked before the provider is asked to change a password: the current one is given,
 * the new one fits bcrypt, matches its confirmation, meets the rules and differs from the
 * current one. Unlike the invitation form, a password set here is always new, so the rules
 * apply in full.
 */
export function checkPasswordChange(
  current: string,
  next: string,
  confirmation: string,
): { ok: true } | { ok: false; error: string } {
  if (current.length === 0) return { ok: false, error: "Enter your current password." };
  const checked = checkPasswordReset(next, confirmation);
  if (!checked.ok) return checked;
  if (next === current) {
    return { ok: false, error: "Choose a password different from your current one." };
  }
  return { ok: true };
}
