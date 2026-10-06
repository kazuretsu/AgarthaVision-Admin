# Commands

Everything runnable in this repo. Bun is the package manager; `npm run <script>` works
identically if Bun is unavailable.

## Daily

| Command         | Does                                                                    |
| --------------- | ----------------------------------------------------------------------- |
| `bun install`   | Install dependencies and run `prepare`, which wires Husky's hooks path. |
| `bun run dev`   | Next.js dev server on `http://localhost:3000`.                          |
| `bun run build` | Production build. Must succeed with no Supabase credentials present.    |
| `bun run start` | Serve a built app. Requires a real `.env.local`.                        |

## Gates

Run in this order; it is the order `.husky/pre-commit` runs them in.

| Command              | Does                                                                                |
| -------------------- | ----------------------------------------------------------------------------------- |
| `bun run typecheck`  | `tsc --noEmit`. Zero errors, no exceptions.                                         |
| `bun run test`       | `vitest run` over `src/**/*.test.ts`. Pure logic only; never needs a live Supabase. |
| `bun run build`      | Full production build.                                                              |
| `bun run lint`       | `eslint .` then `prettier --check .`.                                               |
| `bun run lint:fix`   | `eslint . --fix` then `prettier --write .`.                                         |
| `bun run test:watch` | Vitest in watch mode while developing.                                              |
| `bun run test:db`    | Applies every migration to a throwaway local Postgres and runs `supabase/tests/`.   |
| `bun run clean`      | Remove `.next`, `coverage`, and the bundler cache.                                  |

`vitest` is configured with `passWithNoTests`, so a docs-only or hooks-only commit does not
fail the gate for having touched no test file.

## Components

`bunx shadcn@latest add <name>` adds a shadcn component (Base UI) to `src/components/ui/`, as
configured in `components.json`; it needs network access to `ui.shadcn.com`. Review the diff
before committing, and never run `shadcn init`. `bunx shadcn@latest info` prints the
configuration and the components it sees as installed. Rules: `docs/constraints.md` (#15).

## Database tests

`bun run test:db` (`scripts/db-test.ts`) drops and recreates a local database, applies
Supabase stubs, the app repo's migrations, a small pre-existing seed, this repo's admin
migrations and the test helpers, then runs each `supabase/tests/*.test.sql` in a
transaction that is always rolled back. A `*.test.ts` there runs the same way, its default
export called with the transaction's connection, for a test that checks the database against
the console's own TypeScript (the dashboard parity test). It needs a local Postgres and a checkout of the app
repo, and is not part of the pre-commit hook.

| Variable                  | Default                                                       |
| ------------------------- | ------------------------------------------------------------- |
| `ADMIN_TEST_DATABASE_URL` | `postgres://postgres@localhost:5432/agarthavision_admin_test` |
| `AGARTHAVISION_APP_DIR`   | `../AgarthaVision` — check out its `development` branch       |

`app_0013_deidentified_reads.test.sql` needs an app checkout with `0012` and `0013`, and fails
with a message naming them when it has neither. Every test needs `0014`: the helpers make a
super admin by inserting a `super_admins` row, and the seed stops with a message naming
`0014` when the table is missing. `admin/0004` needs `0015`, and stops with a message naming it
when `reports.patient_id` is missing.

It refuses any host but localhost and any database whose name does not end in `_test`.

## Hooks

Installed by `prepare` (`husky`), which sets `core.hooksPath`.

| Hook                | Runs                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------- |
| `.husky/pre-commit` | ① typecheck ② test ③ build ④ lint. Any failure aborts the commit with a named message. |
| `.husky/commit-msg` | Rejects a subject that is not `[type][ClickUp-ID][Lastname]: Task title`.              |
| `.husky/pre-push`   | Full production build before anything reaches the remote.                              |

Both hooks resolve their runner through `run_bun()`: Bun if it is on `PATH` (adding
`$HOME/.bun/bin` if needed), otherwise npm.

## Environment

```bash
cp .env.example .env.local
```

Then fill in from the Supabase project dashboard. `.env.local` is gitignored and must stay
that way. `bun run build` deliberately works with the file absent — env is read at request
time, not at module load, so a missing variable produces a clear runtime error on the page
that needed it rather than a broken build.
