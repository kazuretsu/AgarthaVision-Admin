---
verified: 2026-10-28
commit: efed466
---

# Notices (14zcqntr35f)

Input: a signed-in super admin or org admin opening any console page → Movement: decide which
notices apply from facts the server already has, drop those this admin closed within their
snooze, hide any on the page its action opens → Output: a stack of shadcn alerts above the
page content, one row each: the words on the left, the action (and a close button, for a notice
that can be closed) on the right.

## Why

Two-step sign-in is each admin's choice (`docs/map/processes/second-factor.md`). Without a
nudge, most admins never turn it on. A strip across the console reminds each one, and is built
to carry more notices later (maintenance windows, a deactivated laboratory).

## Steps

1. **Which apply.** `noticesFor(access, facts)` (`src/domain/notices.ts`) filters the `NOTICES`
   list. Each `Notice` has a stable `id`, a `tone` (info, warning, danger), `title`, `message`,
   an optional `action` (label and href), `dismissible`, `snoozeDays` and `hiddenOn` (paths).
   `NoticeFacts` holds what a rule may read; today `secondFactorOn`.
2. **The fact, at no extra cost.** `ConsoleActor.secondFactorOn` is what the gate already
   learned: a session that passed a code (`aal2`) has an app; one admitted without a code has
   none, since an account with an app is held at `/verify` (`src/adapters/supabase/auth.ts`). At
   sign-in it is read from the factors the sign-in answer lists.
3. **Closed ones.** The `(dashboard)` layout (`src/app/(dashboard)/layout.tsx`) reads one cookie
   per notice, `av_notice_<id>` = `<user id>.<closed at, ms>`, and drops a notice this admin
   closed within its snooze (`isSnoozed`). Another admin's close on the same browser does not
   count.
4. **The strip.** `NoticeBar` (`src/components/shell/NoticeBar.tsx`, client) stacks one shadcn
   `Alert` per notice between the header and the page. It hides a notice on its `hiddenOn`
   paths (`usePathname`, since the layout does not re-render on a client navigation). Close
   writes the cookie with `Max-Age` = the snooze and removes the notice at once.
5. **When the fact changes.** Turning an authenticator app on or off on `/settings` revalidates
   the whole layout, so the notice goes or comes back on the next page.

## The first notice: "Turn on two-step sign-in"

`second-factor-off`, warning: shown to an admin whose account has no authenticator app, on every
console page except `/settings`; "Set up now", on the right, opens `/settings`. **It cannot be
closed** (`dismissible: false`): the reminder stays until an app is set up, then is gone for
good. A close cookie left from when it could be closed (7 days, at first) is ignored.

## Guarantees

- **Not outside the console.** Only the `(dashboard)` layout renders it: never on `/login`,
  `/verify` or the invitation pages. A medtech never reaches the layout.
- **Accessible.** `role="status"` for info and warning, `role="alert"` for danger; the icon is
  hidden from screen readers; a closable notice's close button is labelled ("Close “…” for N
  days").
- **A preference, not a secret.** The cookie only hides a reminder; editing it hides a reminder
  sooner or longer, nothing else.

## Not covered

- Dismissals do not follow the person across browsers or devices. Moving them into the database
  is a later ticket if it is ever needed.

## Adding a notice

One entry in `NOTICES`, and a field in `NoticeFacts` if it needs one, filled where the layout
builds the facts. Nothing else changes.

## If you change this

**Hits**

- Every console page (the layout).
- `ConsoleActor.secondFactorOn` and the gate's second-step logic (`admin-gate.md`).

**Does not hit**

- Access: a notice never grants or refuses anything.

## Tests

`src/domain/notices.test.ts`, `src/adapters/supabase/auth.test.ts` (`secondFactorOn` with no
extra call).

## See

`src/domain/notices.ts`, `src/components/shell/NoticeBar.tsx`, `src/components/ui/alert.tsx`,
`src/app/(dashboard)/layout.tsx`.
