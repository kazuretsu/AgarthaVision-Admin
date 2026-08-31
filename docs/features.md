# Features

What exists today. Anything not listed here is not built.

## Built

### Project scaffold

Next.js App Router app with TypeScript in `strict` mode, Tailwind v4, ESLint, Prettier and
Vitest. Design tokens in `src/app/globals.css` mirror the Android client's Clinical
Microscopy palette — CIT-U maroon `#8C1823` with gold `#FFB81C`, the warm stone neutral
ramp, tabular numerals on data fields and italic binomial species names.

### Commit and build discipline

Husky hooks gate every commit on typecheck, tests, production build and lint, and every
push on a full build. `commit-msg` enforces the `[type][ClickUp-ID][Lastname]` subject
format. `lint-staged.config.js` and `commitlint.config.js` mirror the sibling repo, with a
`scope-enum` adapted to this repo's areas.

### Documentation shelf

`SESSION_INIT.md` routes; `docs/` holds the shelf; `docs/map/` holds the object, process
and effect cards.

## Not built yet, in this pass

Tracked here so the gap is visible, and struck through as each lands:

- Domain model and port interfaces
- Supabase database and storage adapters, and the provider registry
- Supabase Auth behind the auth port, with the `profiles.role` admin gate
- Administrative dashboard: summary cards, EPG trend by species, parasite distribution,
  EPG summary, severity split
- Detailed records table with date-range and advanced filters, and the research-matrix
  export in CSV and JSON

## Out of scope, decided

- Mutating any diagnostic record. The console is read-only over clinical data.
- PDF export. CSV and JSON only this pass.
- Geospatial mapping of sample GPS.
- Anything built on `validation_records` — the table is a Phase 2 ghost with no upstream
  migration behind it.
