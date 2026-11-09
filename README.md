# AgarthaVision Admin Console

Web console for the administrators of **AgarthaVision**, a soil-transmitted helminth (STH)
diagnostic system. The Android client is the medical technologist's capture and
verification tool; this console is the surface for the people who run the system.

- **Live console:** <https://agarthan-admin.vercel.app> (hosted on Vercel)
- **Mobile app:** <https://github.com/Joryuoo/AgarthaVision>

What the console does:

- **Records** — patient → session (one smear) → sample (one field), with each session's
  per-species LPF range and eggs counted exactly as the app reports them.
- **Dashboard** — smears examined, positive smears and rate, a weekly trend and the species
  mix of positive smears, for a chosen period.
- **Research export** — one row per smear in LPF terms, CSV or JSON, with no names or
  birthdates.

Every figure follows the app's rule: a detection the medtech rejected never counts, and a
sample deleted as a duplicate appears nowhere. There is no EPG: Philippine medtechs read a
direct smear, not a Kato-Katz thick smear.

## Tech stack

| Area        | Technology                                                |
| ----------- | --------------------------------------------------------- |
| Framework   | Next.js 16 (App Router), React 19                         |
| Language    | TypeScript                                                |
| UI          | Tailwind CSS 4, shadcn/ui on Base UI, lucide-react icons  |
| Maps        | MapLibre GL                                               |
| Backend     | Supabase: Auth, Postgres with row-level security, Storage |
| Human check | Cloudflare Turnstile                                      |
| Email       | Resend                                                    |
| Testing     | Vitest                                                    |
| Tooling     | Bun, ESLint, Prettier, Husky, lint-staged, commitlint     |
| Hosting     | Vercel                                                    |

`docs/stack.md` has the exact versions.

## Getting started

Prerequisites: [Bun](https://bun.sh) 1.3, and access to the team's Supabase project (the same
one the mobile app uses).

```bash
git clone https://github.com/kazuretsu/AgarthaVision-Admin.git
cd AgarthaVision-Admin
bun install
cp .env.example .env.local   # then fill in from the Supabase dashboard
bun run dev                  # http://localhost:3000
```

Other commands: `bun run build`, `bun run test`, `bun run lint`, `bun run typecheck`
(`docs/commands.md`).

Read `SESSION_INIT.md` first — it is the router into the documentation shelf under
`docs/`. Code is the source of truth; when a doc card and the code disagree, the code
wins.

## Environment variables

Set them in `.env.local` locally, and in the Vercel project's settings for the deployment.
Names only here; `.env.example` explains each one. Never commit a filled-in copy.

| Name                              | Required | Purpose                                                     |
| --------------------------------- | -------- | ----------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`        | Yes      | Supabase project URL                                        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | Yes      | Supabase publishable key (browser-safe)                     |
| `SUPABASE_SERVICE_ROLE_KEY`       | Yes      | Server only: creates an invited person's account            |
| `RESEND_API_KEY`                  | Yes      | Server only: sends invitation emails                        |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`  | No       | Turnstile site key; blank turns the human check off         |
| `CONSOLE_SESSION_SECRET`          | No       | Signs the idle-limit cookie; blank turns the idle limit off |
| `CONSOLE_SESSION_MAX_HOURS`       | No       | Session length limit (default 12)                           |
| `CONSOLE_SESSION_IDLE_MINUTES`    | No       | Idle limit (default 60)                                     |
| `TRUSTED_IP_HEADER`               | No       | Header carrying the client IP, for attempt limits           |
| `SUPABASE_SAMPLES_BUCKET`         | No       | Storage bucket holding sample frames (default `samples`)    |
| `SUPABASE_SIGNED_URL_TTL_SECONDS` | No       | Lifetime of signed image URLs (default 60)                  |
| `DB_PROVIDER`                     | No       | Database adapter (default `supabase`)                       |
| `STORAGE_PROVIDER`                | No       | Storage adapter (default `supabase`)                        |
| `AUTH_PROVIDER`                   | No       | Auth adapter (default `supabase`)                           |
| `MAIL_PROVIDER`                   | No       | Mail adapter (default `resend`)                             |
| `MAIL_FROM`                       | No       | Sender address on the domain verified in Resend             |
| `CONSOLE_URL`                     | No       | Public origin used in invitation links                      |
| `CONSOLE_TIMING`                  | No       | `off` silences the per-request timing logs                  |
