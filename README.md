# AgarthaVision Admin Console

Web console for the `admin` role of **AgarthaVision**, a soil-transmitted helminth (STH)
diagnostic system. The Android client is the medical technologist's capture and
verification tool; this console is the surveillance and reporting surface that the
Android app does not implement.

Two surfaces:

- **Administrative dashboard** — summary cards, EPG trend over time by species, parasite
  distribution, EPG summary, and the light / moderate / heavy severity split.
- **Detailed records** — every processed sample across all users, with date-range and
  advanced filters, exported as a research matrix (CSV and JSON).

Only human-in-the-loop validated records count toward reports. Pending, failed, and
unverified inference output is excluded from official aggregation.

## Getting started

```bash
bun install
cp .env.example .env.local   # then fill in from the Supabase dashboard
bun run dev
```

Read `SESSION_INIT.md` first — it is the router into the documentation shelf under
`docs/`. Code is the source of truth; when a doc card and the code disagree, the code
wins.
