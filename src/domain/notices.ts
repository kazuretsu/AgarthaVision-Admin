import type { ConsoleAccess } from "./access";

/**
 * Notices: short messages across the top of every console page for the signed-in admin
 * (14zcqntr35f). Each says one thing, may offer one action, and may be closed for a while.
 * Which ones apply is decided here, from facts the server already has; adding a notice means
 * one entry in {@link NOTICES} and, if it needs one, a fact in {@link NoticeFacts}.
 */

export type NoticeTone = "info" | "warning" | "danger";

export interface Notice {
  /** Stable: closing it is remembered under this id. */
  id: string;
  tone: NoticeTone;
  title: string;
  message: string;
  action: { label: string; href: string } | null;
  dismissible: boolean;
  /** How long closing hides it, in days. Ignored when not dismissible. */
  snoozeDays: number;
  /** Paths where it is not shown, such as the page its action opens. */
  hiddenOn: readonly string[];
}

/** What the server knows about the signed-in admin that a notice can depend on. */
export interface NoticeFacts {
  /** The account has an authenticator app (14zcqntr31c). */
  secondFactorOn: boolean;
}

interface NoticeRule {
  notice: Notice;
  applies: (access: ConsoleAccess, facts: NoticeFacts) => boolean;
}

/** Every notice the console can show, in the order they stack. */
const NOTICES: readonly NoticeRule[] = [
  {
    notice: {
      id: "second-factor-off",
      tone: "warning",
      title: "Turn on two-step sign-in",
      message:
        "Your account can read patients' records. Add a code from an authenticator app to every sign-in, so a password alone cannot open it.",
      action: { label: "Set up now", href: "/settings" },
      // Not closable: the reminder stays until two-step sign-in is on.
      dismissible: false,
      snoozeDays: 0,
      hiddenOn: ["/settings"],
    },
    applies: (_access, facts) => !facts.secondFactorOn,
  },
];

/**
 * The notices that apply to this admin (a super admin or an org admin: a medtech never reaches
 * the console), before any they closed are taken out.
 */
export function noticesFor(access: ConsoleAccess, facts: NoticeFacts): Notice[] {
  return NOTICES.filter((rule) => rule.applies(access, facts)).map((rule) => rule.notice);
}

/** Where the browser remembers a closed notice: one cookie per notice. */
export function noticeCookieName(noticeId: string): string {
  return `av_notice_${noticeId}`;
}

/** The cookie's value: who closed it, and when (ms since epoch). */
export function noticeDismissal(userId: string, at: number): string {
  return `${userId}.${at}`;
}

/**
 * Whether a notice is hidden because this admin closed it within its snooze. A dismissal by
 * someone else on the same browser does not count, and one past its days has lapsed.
 */
export function isSnoozed(
  notice: Notice,
  dismissal: string | undefined,
  userId: string,
  now: number,
): boolean {
  if (!notice.dismissible || !dismissal) return false;
  const separator = dismissal.lastIndexOf(".");
  const by = dismissal.slice(0, separator);
  const at = Number(dismissal.slice(separator + 1));
  if (separator <= 0 || by !== userId || !Number.isFinite(at) || at > now) return false;
  return now - at < notice.snoozeDays * 24 * 60 * 60 * 1000;
}

/** Whether a notice is shown on this path. */
export function shownOn(notice: Notice, pathname: string): boolean {
  return !notice.hiddenOn.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
