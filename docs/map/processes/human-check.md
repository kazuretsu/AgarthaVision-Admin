---
verified: 2026-10-16
commit: 4be4bf5
---

# Human check (14zcqntnqpc)

Input: the sign-in or invitation form → Movement: Cloudflare Turnstile issues a single-use
token in the browser; the server action hands it to the auth provider with the password →
Output: signed in, or "The security check expired or did not pass".

## Why

The console's sign-in and the invitation page call the auth provider from the server, so the
provider's per-IP limits see the host, not the visitor. A Turnstile token per attempt makes
scripted guessing expensive, and it also covers calls made straight to Supabase's
`/auth/v1/token` with the public key, which skip the console: once Supabase's CAPTCHA
protection is on, Supabase refuses any sign-in without a valid token, from any client.

## Steps

1. **Widget.** `src/components/auth/HumanCheck.tsx` loads Turnstile's script
   (`challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`) and renders the widget
   in the form, labelled `sign-in` (`/login`) or `accept-invitation` (`/invite/[token]`). Its
   token lives in React state and posts in the hidden `humanCheckToken` field. Submit stays
   disabled until there is a token. Not a shadcn component: like the prevalence map, it wraps
   a third-party widget the registry has nothing for.
2. **One token per attempt.** The form calls `consume()` as it submits: the posted form data
   already holds the token, and the widget is reset so the next attempt gets a new one.
3. **Server.** `readHumanCheckToken` (`src/domain/human-check.ts`) passes on a non-empty
   string of at most 2048 characters, else nothing. `signIn` puts it in `Credentials`;
   `acceptInvitation` puts it in `AcceptInvitationRequest`.
4. **Provider.** The Supabase adapters send it as `options.captchaToken` on
   `signInWithPassword` (`humanCheckOptions`, `src/adapters/supabase/errors.ts`). Supabase
   checks it with Cloudflare. A refusal (`captcha_failed`) is `HumanCheckFailedError` at
   sign-in and `human_check_failed` on the invitation page; neither says anything about the
   password. On the invitation page the check is verified at the sign-in step, after
   `auth.admin.createUser` (the service role is not subject to it): a refused check leaves an
   account that joined nothing, and the next attempt finds it and signs in.

## Settings

| Where                                                          | What                                                 |
| -------------------------------------------------------------- | ---------------------------------------------------- |
| Cloudflare → Turnstile → widget `AgarthaVision`                | Hostname `agarthan-admin.vercel.app`, Managed        |
| Vercel → `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Production, Config) | The widget's site key. Public; inlined at build      |
| Supabase → Authentication → Attack Protection → CAPTCHA        | Turnstile, the widget's **secret** key. Nowhere else |

The mobile app uses the same widget (`TURNSTILE_SITE_KEY_*`, `TURNSTILE_HOSTNAME_*` in its
`local.properties`), so one secret in Supabase covers both.

**Rollout order.** Supabase's switch goes last: only after this code is deployed **and**
medtechs have installed the app release that sends a token. Switched on earlier, every
sign-in without a token is refused. Until then a token is sent and ignored.

**Without a site key** (a preview, a local build) the widget does not render and no token is
sent, which works only while Supabase's switch is off.

## If you change this

**Hits**

- The sign-in and invitation forms, and their server actions.
- A Content Security Policy, when the security headers ticket adds one: it must allow
  `https://challenges.cloudflare.com` in `script-src` and `frame-src`.
- `src/adapters/supabase/auth.test.ts`, `onboarding.test.ts`, `src/domain/human-check.test.ts`.

**Does not hit**

- Anything behind the gate. The check runs only where a password is entered.
- The service-role key: `createUser` takes no token.

## See

`docs/map/processes/admin-gate.md` (sign-in), `docs/map/processes/invitations.md`
(accepting), `docs/map/objects/ui-components.md`.
