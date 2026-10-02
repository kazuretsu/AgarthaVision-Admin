# Constraints

Thirteen rules this repo is built to hold. Each names where it is enforced. A constraint
without an enforcement point is a wish, not a constraint.

---

### 1. Ports before providers

Feature and UI code imports from `src/ports/` only. It never imports `src/adapters/`, and
never imports `@supabase/supabase-js` directly. A port is a pure TypeScript interface with
no vendor types in its signature. Swapping the database or the file store must not touch a
single file under `src/app/` or `src/components/`.

**Enforced at:** review of every diff that adds an import; `src/ports/*.ts` contain no
vendor import statements; the only construction site for a provider is
`src/adapters/registry.ts`.

### 2. Server-only secrets

The service-role key is read on the server, at request time, and never reaches the browser.
Today no code reads it at all: every read, image signing included, runs as the signed-in
user.
Only `NEXT_PUBLIC_`-prefixed variables may appear in client components. Env access goes
through the accessor helpers, which throw a named error when a variable is missing —
never at module load.

**Enforced at:** `src/lib/env.ts` (lazy accessors, no top-level throw);
`src/adapters/supabase/client.ts` (builds only the request-scoped client);
`.env.example` documents which variables are public and which are not.

### 3. Admin-only routes

Every console surface requires a session with console access: a **super admin** (the
AgarthaVision developers and owners, an active grant in `super_admins` read through
`is_admin()`, D22) or an **organization admin**
(a clinic's admin staff, an active org-admin membership). Medtechs use the mobile app only. A
medtech session is not a partial admin: it sees a notice pointing to the mobile app and no
data.
Access is read server-side on every request; a cookie, a JWT claim or `user_metadata` is
never the authority, and neither is the retired `profiles.role`. The console asks the same
`is_admin()` every database policy asks, so the two never disagree about who is a super
admin. Hiding a sidebar link is presentation, not protection.

**Enforced at:** `src/domain/access.ts` (`resolveConsoleAccess`, the rule itself);
`src/app/(dashboard)/layout.tsx` (server-side gate before any child renders);
`src/lib/console-access.ts` (`requirePageAccess` for narrower pages, `requireRouteAccess`
for route handlers); `src/ports/auth.ts` (`requireConsoleActor()` is the only entry point
features may call). `src/proxy.ts` refreshes the session and is not a gate. Which records
an org admin may read is decided twice: by the `ReadScope` every clinical read requires
(`src/domain/scope.ts`), and by the policies in `supabase/migrations/admin/0002`.

### 4. Read-mostly console

The console reads clinical data. It does not create, edit, delete or re-validate
patients, sessions, samples, detections or verdicts — that is the Android client's
human-in-the-loop workflow. Its only writes are administrative (organizations today;
memberships, assignments and shares later), each through a narrow port that records it in
the audit trail (D2). Nothing is deleted: organizations and members are deactivated.

**Enforced at:** `src/ports/db.ts` exposes query methods only — there is no `insert`,
`update` or `delete` in it, so no feature can write clinical data. Administrative writes
exist only on `src/ports/admin-write.ts`, and each is a security-definer function in
`supabase/migrations/admin/` that audits itself; the tables have no write policies.

### 5. Schema parity with AgarthaVision

`src/domain/` mirrors the sibling repo's data model. Column names, enum values and
nullability match the Postgres schema, not a convenient local variant. Where the Android
client keeps Room-only fields (`status`, `is_repeat`, `predictions_json`), this console
does not invent them. Where Room and Postgres disagree on casing (detection verdicts are
lowercase in Room, UPPERCASE in Postgres), the adapter maps and the domain stays canonical.

**Enforced at:** `src/domain/entities.ts` and `src/domain/enums.ts` carry per-field
provenance comments; `src/adapters/supabase/db.ts` is the only place a Postgres row shape
is named.

### 6. Validated data only in reports

Only human-validated records count. A sample row exists upstream only once a medtech
verified it, and a sample deleted as a duplicate counts toward nothing. Every detection the
medtech did not reject counts as an egg — `WRONG_CLASS` and `BOX_INCORRECT` are real eggs —
which is the app's own rule; the console never disagrees with the app about one smear.

**Enforced at:** `src/domain/clinical.ts` (`isCountedDetection`, `isLiveSample`,
`summariseSession`), with `src/domain/clinical.test.ts` holding the app's own test cases.
The dashboard (`src/domain/dashboard.ts`) and the research export
(`src/domain/research-export.ts`) read the same `SessionSummary`, so no surface counts a
smear differently from another. This is a clinical requirement, not a display
preference.

### 7. Migrations own the schema

The app repo's `supabase/migrations/*.sql` own the clinical schema; when it changes,
`src/domain/` follows and this console never leads. This repo owns only the console's own
objects (D4), in `supabase/migrations/admin/NNNN_*.sql` with its own sequence. Admin
migrations are **additive only**: new tables, functions, triggers and permissive policies,
never an `ALTER` or `DROP` of anything the app owns. A change to an app-owned table goes to
the app repo instead. Both kinds are applied by hand, once, in the SQL editor.

**Enforced at:** review; `bun run test:db` applies the app's migrations then the admin ones
to a local database and runs `supabase/tests/`, which include checks that the app's own
writes still succeed. `docs/map/objects/domain-model.md` records the upstream migration
number each field came from.

### 8. Commit format

Every commit subject is `[type][ClickUp-ID][Lastname]: Task title` — note the colon
before the title. Types: `feat enhancements fix security docs ui ux uiux refactor test ci
chore`. No trailers of any kind in the body.

**Enforced at:** `.husky/commit-msg`. Only the first line is checked, so bodies are
free-form. Merge, revert, fixup and squash subjects are skipped because git writes those
itself. A rejected commit prints the format, the type list with a gloss for each, and the
subject that failed.

**History predates the colon.** Every commit before this hook landed uses the older
`[type][ClickUp-ID][Lastname] Task title` shape with no colon — the hook only sees new
commits, so the log is mixed and that is expected, not drift.

**Shared with the app repo.** This is the same format the AgarthaVision app repo enforces
as its C9, so a contributor moving between the two repos writes one subject line, not two.

**Caveat:** `commitlint.config.js` is still committed and still extends
`@commitlint/config-conventional` with a scope enum — a _conventional-commit_ shape that
contradicts the bracket format above and is wired to no hook. `lint-staged.config.js` is
likewise unreferenced by any hook. Both are dead configuration; neither describes what
actually runs.

### 9. Hooks are not optional

`bun run typecheck`, `bun run test`, `bun run build` and `bun run lint` all pass before a
commit lands, and the build passes again before a push. `--no-verify` is not a workflow.

**Enforced at:** `.husky/pre-commit` (four numbered gated steps, each with its own failure
message and `exit 1`); `.husky/pre-push` (full build).

### 10. Docs change in the same commit

A commit that changes behavior changes the card that describes it. `docs/CHANGELOG.md` and
`docs/features.md` are not written at the end of a sprint; they are written in the diff.

**Enforced at:** review of every feature commit; `docs/CHANGELOG.md` entries are dated by
commit, not by release.

### 11. Code wins over cards

When a card in `docs/map/` disagrees with the code it cites, the code is right and the card
is stale. Fix the card, do not bend the code to it. Cards cite `path:line` so the
disagreement is cheap to find.

**Enforced at:** every card's citations; `SESSION_INIT.md` states the precedence.

### 12. No committed secrets

No real URL, key, token or credential is ever committed. `.env.example` holds variable
names with empty values. `.env.local` is gitignored. Plausible-looking placeholder
credentials are still forbidden — they get copy-pasted.

**Enforced at:** `.gitignore` (`.env*` with a single `!.env.example` exception);
`.env.example` (empty values only).

### 13. Router stays thin

`SESSION_INIT.md` answers three questions — what this is, where docs live versus ClickUp,
and where to go — plus the constraint names as a spine. It carries no code, no schema, no
command bodies, and no explanation that belongs on a shelf file. It is read once, never
re-read. If it grows past roughly 60 lines, content has leaked into it.

**Enforced at:** review of any diff touching `SESSION_INIT.md`.

### 14. Patient identity stays with the clinic

A patient's name, sex and birthdate reach an **organization admin** of the patient's own
laboratory and nobody else in the console. A **super admin** reads records de-identified:
no name, sex or birthdate, no name search, no session label (a generated label such as
`LDNJ-M21-S01` spells the surname's letters, sex, age and first initial), and no medtech's
free-text note on a field, which can name the patient. Each clinic is the controller of its
patients' data under RA 10173 and AgarthaVision hosts it as the clinic's processor; running
the platform needs no patient's identity, so proportionality (§11) keeps it out. Pages name a
de-identified patient and session by the first eight characters of the record id.

A super admin's patient, session and sample reads come from the app's de-identified views
(`patients_deidentified`, `sessions_deidentified`, `samples_deidentified`, app
`0012_deidentified_reads.sql`), never from the tables. Since app
`0013_super_admin_reads_deidentified.sql` the tables return a super admin nothing, so the
database enforces the rule too: the console's code is the first line and the app's policies
the second.

**Enforced at:** `src/domain/access.ts` (`patientDisclosureFor`, the rule);
`src/ports/db.ts` (every patient and smear read takes a `PatientDisclosure`);
`src/adapters/supabase/database.ts` (`SOURCES`, which picks the views and their columns for
a de-identified reader; `toSession` and `toSample`, which drop the label and the note
whatever the source returns); `src/adapters/supabase/database.test.ts` (no super admin request
names an identity column or a clinical table); app `0012`/`0013`, covered by
`supabase/tests/app_0013_deidentified_reads.test.sql`.
