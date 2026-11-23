---
verified: 2026-11-23
commit: bbf83da
---

# Report check: the QR code on a report (14zcqnty9bj)

Input: anyone holding a printed or PDF report who scans its QR code → Movement: the console
looks up that one report and compares the link with it → Output: a public page saying the
report is in AgarthaVision's records, with its stored findings to compare with the paper, or
that the link cannot be confirmed, or that no report matches.

## Why

The app prints a QR code on every session and patient PDF (mobile ticket 86d4a6jzt). Reports
reach doctors through patients, not through the laboratory, so a reader needs a way to tell
whether the paper in front of them matches what the laboratory recorded. The code carries
only ids, so it proves nothing by itself; the check is the reader comparing the page's
findings with the paper's.

## The link

`/verify/report?id=<report>&session=<session>&ts=<epoch seconds>` for a session report, or
`&patient=<patient>` in place of `session` for a patient report. Release builds of the app
point at the production console, which serves `main`; debug builds at the staging console.

## Steps

1. **The page.** `/verify/report` (`src/app/(public)/verify/report/page.tsx`) is outside the
   `(dashboard)` group, so the sign-in gate in that layout never runs for it, and it is the
   only page outside it besides the sign-in and invitation pages (constraint #3). A visitor
   whose console session just ended is not sent to `/login` (`signedOutPage`,
   `src/proxy.ts:36-44`). Every other unknown path still falls to `(dashboard)/[...missing]`
   and its gate.
2. **The link.** `parseReportCheckLink` (`src/domain/report-check.ts:49`) takes exactly one
   `id`, exactly one of `session` and `patient`, each a uuid, and `ts` as whole seconds. A
   malformed link is answered as an unknown report, and the database is not asked.
3. **The limit.** `checkReportLink` (`src/lib/report-check.ts:28`) runs the check inside
   `withAttemptLimit` under `reportCheckAttemptKeys` (`src/domain/report-check.ts:103`).
   A check has no email, so the visitor's IP takes the email's place: five failed checks
   (an unknown report or an altered link) from one address within 15 minutes refuse the next
   before the database is asked. The IP column stays empty, so failed checks never use up the
   sign-in forms' per-IP allowance (`docs/map/processes/admin-gate.md`, Attempt limits).
4. **The lookup.** `ReportCheckPort.checkReport` (`src/ports/report-check.ts`), over the
   request's own client (`src/adapters/supabase/report-check.ts:25`): signed out, that is
   the anon key. It calls `console_check_report` (`admin/0025`), never the service role.
5. **The function.** `console_check_report` (`supabase/migrations/admin/0025_report_check.sql:27`)
   reads one `reports` row by id, as a security-definer function granted to `anon` and
   `authenticated`. A session report matches when `session` is its `session_id`, `patient` is
   absent and `ts` is its `generated_at` in whole seconds; a patient report the same with
   `patient_id`. No row: no report has that id, or it has not synced yet. A mismatch row
   carries nothing else. A confirmed row carries the report type, `generated_at`, the
   patient's laboratory name (`patient_organizations`), the sample and egg totals,
   `positive_species` and `lpf_per_species`.
6. **What it shows.** `ReportCheckView` (`src/components/report-check/ReportCheckView.tsx`):
   the confirmation, laboratory, report type, generated time, fields examined, eggs confirmed
   and each species with its range (`checkedSpeciesRows`, `src/domain/report-check.ts:79`),
   or "No parasites found."; otherwise one notice for an altered link, an unknown report
   (with the offline-sync note), the attempt limit, or a check that could not be made.

## Hits / Does not hit

- **Hits:** `public.reports` (read, one row), `public.sessions`, `public.patient_organizations`
  and `public.organizations` (joined for the laboratory name), `console_sign_in_attempts`
  (failed checks, kind `report_check`).
- **Does not hit:** any patient or profile column, the `reports` bucket, the PDF itself.

## Surfaces

The page names no patient (name, sex, birthdate, address, session label) and no medtech
(constraint #14), and returns none of the ids it was asked about. Holding a report's id is
what lets someone see its findings, the same as holding the paper.

## Connected to

- `docs/map/processes/admin-gate.md` — the gate this page is outside, and the attempt limits.
- `docs/map/objects/ports.md` — `ReportCheckPort`.
- `docs/map/objects/provider-registry.md` — `getReportCheck()`.
