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
| `bun run clean`      | Remove `.next`, `coverage`, and the bundler cache.                                  |

`vitest` is configured with `passWithNoTests`, so a docs-only or hooks-only commit does not
fail the gate for having touched no test file.

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
