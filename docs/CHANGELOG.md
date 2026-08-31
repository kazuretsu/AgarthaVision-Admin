# Changelog

Newest first. One entry per commit that changes behavior or contract.

## [feat] Define domain model and provider port interfaces

`src/domain/` now mirrors the upstream Postgres schema after migration `0008`, with
per-field provenance comments. Added the pure logic the console reports on: EPG at the DOH
multiplier of 24 counting `CONFIRMED` detections only, species-specific severity bands, the
six fixed research-matrix columns with CSV and JSON serialisation, and the record filters.
51 unit tests cover it; none needs a live Supabase.

`src/ports/` defines `DatabasePort`, `StoragePort` and `AuthPort` with no vendor type in
any signature. The database port exposes reads only — the read-mostly constraint is
enforced by the absence of a mutation verb, not by a comment.

Two judgement calls worth recording. First, `WRONG_CLASS` and `BOX_INCORRECT` detections
are real eggs but do not count toward EPG, because the Android client's session reports
count `CONFIRMED` only and the two surfaces must not disagree about the same smear.
Second, Phase 1 has no per-sample validation-state column and `validation_records` is a
Phase 2 ghost, so validation status is derived from `verified_at` and `needs_reannotation`;
that derivation is documented on the enum.

## [ci] Configure Husky git hooks for typecheck, test, and build verification

Ported the Android repo's hook discipline to the Next.js toolchain. `pre-commit` gates on
four numbered steps — typecheck, unit tests, production build, eslint plus prettier — each
with its own failure message and non-zero exit. `pre-push` repeats the full build.
`commit-msg` enforces `[type][ClickUp-ID][Lastname] Task title` and prints the expected
format on rejection. `run_bun()` mirrors the sibling's `run_gradle()`. Added
`lint-staged.config.js` and `commitlint.config.js` with a `scope-enum` for this repo's
areas.

## [chore] Scaffold Next.js admin console with TypeScript and Tailwind

Next.js 16 App Router, React 19, TypeScript `strict`, Tailwind v4, ESLint, Prettier,
Vitest. Design tokens mirror the Android client's palette. `.env.example` carries variable
names with empty values; `.env.local` is gitignored.
