# AgarthaVision Admin Console

Web console for the administrators of **AgarthaVision**, a soil-transmitted helminth (STH)
diagnostic system. The Android client is the medical technologist's capture and
verification tool; this console is the surface for the people who run the system.

- **Records** — patient → session (one smear) → sample (one field), with each session's
  per-species LPF range and eggs counted exactly as the app reports them.
- **Dashboard** — smears examined, positive smears and rate, a weekly trend and the species
  mix of positive smears, for a chosen period.
- **Research export** — one row per smear in LPF terms, CSV or JSON, with no names or
  birthdates.

Every figure follows the app's rule: a detection the medtech rejected never counts, and a
sample deleted as a duplicate appears nowhere. There is no EPG: Philippine medtechs read a
direct smear, not a Kato-Katz thick smear.

## Getting started

```bash
bun install
cp .env.example .env.local   # then fill in from the Supabase dashboard
bun run dev
```

Read `SESSION_INIT.md` first — it is the router into the documentation shelf under
`docs/`. Code is the source of truth; when a doc card and the code disagree, the code
wins.
