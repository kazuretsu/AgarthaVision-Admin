# Stack

As-built. Versions are what `bun.lock` resolved, not what a range permits.

| Layer                            | Choice                           | Version                 |
| -------------------------------- | -------------------------------- | ----------------------- |
| Runtime / package manager        | Bun                              | 1.3.11                  |
| Framework                        | Next.js (App Router)             | 16.3.3                  |
| UI runtime                       | React / React DOM                | 19.2.8                  |
| Language                         | TypeScript (`strict`)            | 5.9.3                   |
| Styling                          | Tailwind CSS                     | 4.3.3                   |
| UI primitives                    | Base UI (`@base-ui/react`)       | 1.8.0                   |
| Theme switching                  | `next-themes`                    | 0.4.6                   |
| Icons                            | `lucide-react`                   | 1.49.0                  |
| Database + auth + storage client | `@supabase/supabase-js`          | 2.112.4                 |
| Server-side session cookies      | `@supabase/ssr`                  | 0.12.5                  |
| Tests                            | Vitest                           | 4.1.11                  |
| Lint                             | ESLint + `eslint-config-next`    | 9.x / 16.3.3            |
| Format                           | Prettier                         | 3.9.6                   |
| Hooks                            | Husky + lint-staged + commitlint | 9.1.7 / 17.4.1 / 21.2.2 |

## Notes

- **Node 22** is the runtime under Bun for the Next.js build.
- **Next 16 renamed `middleware.ts` to `proxy.ts`.** The unauthenticated bounce lives in
  `proxy.ts` at the repo root of `src/`.
- **No charting library.** The EPG trend, distribution bars and severity split are
  hand-crafted inline SVG, mirroring the Android client's design rule. One less dependency
  and no runtime bundle cost.
- **shadcn on Base UI (D1).** `src/components/ui/` holds shadcn-style components written
  against Base UI primitives, not Radix — no Radix package is installed. The shadcn CLI's
  registry is not used; the files are ours and are edited in place. `cn()` in
  `src/lib/utils.ts` merges classes with `clsx` + `tailwind-merge`, and variants use
  `class-variance-authority`.
- **Light and dark themes.** `next-themes` toggles a `dark` class on `<html>`; the semantic
  tokens in `src/app/globals.css` swap under it, so components need no `dark:` classes of
  their own.
- **No web font is fetched at build time.** The font stack asks for Inter and falls back to
  the system UI face, so the production build has no network dependency.

## Deferred by explicit decision

Not missing — decided against for this pass, and recorded so nobody re-litigates them
silently.

| Deferred                  | Instead, this pass                             | Why                                                                                                                                       |
| ------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Better Auth               | Supabase Auth behind `src/ports/auth.ts`       | One identity provider already exists upstream; the port is the seam that makes the swap cheap later.                                      |
| Drizzle ORM               | Hand-written queries in the Supabase adapter   | The console issues a small, fixed set of read queries. An ORM would add a schema-ownership claim this repo must not make (constraint #7). |
| S3 storage adapter        | Supabase Storage behind `src/ports/storage.ts` | Sample bytes already live in the `samples` bucket.                                                                                        |
| A second database adapter | Supabase only                                  | The registry's unknown-provider path is tested, so the second adapter is an addition, not a refactor.                                     |
| PDF export                | CSV and JSON                                   | Column fidelity for the research matrix matters more than layout this pass.                                                               |
| Geospatial mapping        | GPS columns carried, not plotted               | Out of scope.                                                                                                                             |
