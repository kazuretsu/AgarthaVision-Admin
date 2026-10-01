# Deployment

How the console is hosted, where every setting lives, and how to redeploy. Secret values are
never written here (#12): this page names each secret and says where it is stored, nothing
more.

The custom domain `agarthavision.kazuretsu.dev` is not attached yet. Until it is, the console
lives at **`https://agarthan-admin.vercel.app`**.

## Where each setting lives

| Service    | Holds                                                                      |
| ---------- | -------------------------------------------------------------------------- |
| Vercel     | The build, the public URL, the console's environment variables             |
| Supabase   | Database, Auth (Site URL, redirect allow-list, SMTP, rate limits), Storage |
| Resend     | The sending domain `mail.kazuretsu.dev` and the SMTP API key               |
| Cloudflare | DNS for `kazuretsu.dev`, including the records that verify Resend          |

## Vercel

| Setting                    | Value                                                           |
| -------------------------- | --------------------------------------------------------------- |
| Team / plan                | Immersive Web Studio, Hobby                                     |
| Project                    | `agarthan-admin`, imported from `kazuretsu/AgarthaVision-Admin` |
| Framework preset           | Next.js, root directory `./`, default build settings            |
| Production branch tracking | `staging`                                                       |
| Production domain          | `agarthan-admin.vercel.app`                                     |
| Preview                    | All other branches; every pull request gets its own URL         |
| Deployment Protection      | Vercel Authentication off                                       |

Settings → Environments holds the branch tracking; Settings → Deployment Protection holds the
login wall.

- **Production follows `staging`, not `main`.** `staging` is the branch people test, so it is
  what the public URL serves. When `main` becomes the release branch, change Production's
  branch tracking to `main`.
- **Protection is off on purpose.** Every page already requires a Supabase sign-in and a console
  role (#3), so an unprotected preview exposes the login page, not data. Vercel Authentication
  would also lock out everyone outside the Vercel team.
- **The Hobby plan is for non-commercial use.** Move to Pro before the console serves a paying
  laboratory.
- **Do not give a domain to the Preview environment.** A domain there only resolves once a
  Preview build of its branch exists; while Production tracks `staging`, none ever will, and
  the domain answers `404 DEPLOYMENT_NOT_FOUND`.

### Environment variables

Settings → Environment Variables. Names only; values come from the Supabase dashboard
(Project Settings → API Keys).

| Variable                        | Environments        | Sensitive | Read by                          |
| ------------------------------- | ------------------- | --------- | -------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Production, Preview | No        | Browser and server               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview | No        | Browser and server (RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY`     | Production only     | **Yes**   | Server only; see `.env.example`  |

- The service role key bypasses RLS. It is never prefixed `NEXT_PUBLIC_` (#2), is marked
  Sensitive so the dashboard will not show it again, and is kept out of Preview: pull-request
  builds run code that has not been reviewed yet.
- `DB_PROVIDER`, `STORAGE_PROVIDER`, `AUTH_PROVIDER`, `SUPABASE_SAMPLES_BUCKET` and
  `SUPABASE_SIGNED_URL_TTL_SECONDS` are not set on Vercel. Each falls back to the default shown
  in `.env.example`.
- **Previews share the live Supabase project.** There is no separate staging database, so a
  preview reads and writes the same data as production. Synthetic patients only.
- A changed variable takes effect on the **next** build. Redeploy after editing one.

## Supabase

### Auth URLs

Authentication → URL Configuration.

| Setting       | Value                                  |
| ------------- | -------------------------------------- |
| Site URL      | `https://agarthan-admin.vercel.app`    |
| Redirect URLs | `https://agarthan-admin.vercel.app/**` |

Every link in an auth email (password recovery, and invitations once they exist) is built from
these. A console URL missing from the list makes Supabase send people to the Site URL instead.

### Email (SMTP through Resend)

Authentication → Emails → SMTP Settings, custom SMTP enabled.

| Field        | Value                         |
| ------------ | ----------------------------- |
| Sender email | `no-reply@mail.kazuretsu.dev` |
| Sender name  | `AgarthaVision`               |
| Host         | `smtp.resend.com`             |
| Port         | `465`                         |
| Username     | `resend`                      |
| Password     | The Resend API key (below)    |

Authentication → Rate Limits: the email limit is raised from Supabase's default so testing a
few sends does not lock the project out.

The Resend key lives **only** here. Supabase sends the auth emails, so the console never holds
it and it is not a Vercel variable. If the console ever sends mail itself, that is a new
server-only variable.

## Resend

Domains → `mail.kazuretsu.dev`.

| Setting               | Value                    | Why                                                         |
| --------------------- | ------------------------ | ----------------------------------------------------------- |
| Domain                | `mail.kazuretsu.dev`     | Keeps this project's sending reputation off the root domain |
| Region                | Tokyo (`ap-northeast-1`) | Closest Resend region to the Philippines                    |
| Custom Return-Path    | `send`                   | Resend's default                                            |
| Tracking subdomain    | none                     | Click tracking rewrites the links in auth emails            |
| Click / open tracking | off                      | Rewritten reset links look like phishing to mail filters    |
| Receiving             | off                      | Nothing receives mail at this domain                        |

API keys → one key, **Sending access** restricted to `mail.kazuretsu.dev`, used as the Supabase
SMTP password. Resend shows a key once; to rotate it, create a new key, paste it into Supabase,
then delete the old one.

## Cloudflare DNS

`kazuretsu.dev` → DNS → Records. Names as Cloudflare shows them; it appends `.kazuretsu.dev`.

| Type  | Name                     | Content                              | Proxy    | Purpose |
| ----- | ------------------------ | ------------------------------------ | -------- | ------- |
| TXT   | `resend._domainkey.mail` | The `p=…` public key shown in Resend | —        | DKIM    |
| CNAME | `rsend.mail`             | `rsend-apne1.forge.rmta.net`         | DNS only | SPF     |
| CNAME | `send.mail`              | `send.forge.rmta.net`                | DNS only | SPF     |
| TXT   | `_dmarc`                 | `v=DMARC1; p=none;`                  | —        | DMARC   |

- **Both CNAMEs must be DNS only** (grey cloud). A proxied record never verifies.
- **DMARC was added by hand.** Resend lists it as optional and its Cloudflare auto-configure did
  not write it. `_dmarc` on the root also covers `mail.kazuretsu.dev`; `p=none` reports and never
  blocks. Gmail sends mail without DMARC to spam more often.
- **Resend may sit on Pending for up to an hour** after the records are added. If it looked
  before they existed, resolvers remember "not found" until that answer expires. It re-checks on
  its own; the ▷ button next to Auto configure only plays a tutorial.

## Redeploying

- **Normal path:** merge a pull request into `staging`. Vercel builds it and moves
  `agarthan-admin.vercel.app` to the new build when it is Ready.
- **Rebuild without a code change** (after editing an environment variable, say): Deployments
  → the latest `staging` deployment → ⋯ → Redeploy. If there is none, Deployments → ⋯ → Create
  Deployment, branch `staging`.
- **Roll back:** Deployments → a previous Ready deployment → Instant Rollback. The next merge
  into `staging` deploys normally again.
- **Migrations go first (#7).** A pull request that adds a file under
  `supabase/migrations/admin/` says so in its description. Apply that file in the Supabase SQL
  Editor **before** merging; the merge deploys straight to the public URL, and code that expects
  a missing table errors on every page that reads it.

## Checking email end to end

Run once Resend shows the domain as Verified, and again after any change above.

1. Supabase → Authentication → Users → a test user with a Gmail address → ⋯ → Send password
   recovery.
2. The message lands in the **inbox**, not spam.
3. In Gmail, ⋮ → Show original: SPF, DKIM and DMARC all read **PASS**.
4. Resend → Emails lists the message, which proves it went through Resend.
5. The link in the email opens `agarthan-admin.vercel.app`.

The console has no page yet that consumes the token in that link, so step 5 ends on the sign-in
page and no password changes. Handling the link belongs with invitations.

## Attaching `agarthavision.kazuretsu.dev` later

1. Vercel → Settings → Domains → add `agarthavision.kazuretsu.dev` to Production.
2. Cloudflare → add the CNAME Vercel shows, **DNS only**.
3. Supabase → change the Site URL to the new domain and add `https://agarthavision.kazuretsu.dev/**`
   to Redirect URLs. Keep the `vercel.app` entry until nothing links to it.
4. Update this page.

None of the email records change: they sit under `mail.`, apart from the console's name.

Nothing printed on paper (a report's QR code) may point at a `vercel.app` URL. Paper outlives a
hosting choice, so printed links wait for the permanent domain.
