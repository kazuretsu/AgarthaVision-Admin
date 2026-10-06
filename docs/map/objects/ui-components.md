---
verified: 2026-10-06
commit: a62ef7a
---

# UI components

The console's primitives: shadcn components on Base UI in `src/components/ui/`, added with the
shadcn CLI from `components.json`. Every other component composes them (constraint #15).

## Why this shape

- **Registry first, never from scratch.** A primitive written by hand costs tokens to write
  and review, drifts from the others, and has no documentation but its own source. A shadcn
  component arrives tested and accessible, with docs at `ui.shadcn.com/docs/components/base/<name>`,
  and every agent already knows its API.
- **You still own the file.** The CLI copies source into `src/components/ui/`; nothing is an
  npm dependency. Adapt it to the console after adding it, and record the adaptation below.
- **Base UI, not Radix (D1).** `components.json` sets `style: "base-nova"`, so the CLI
  installs the Base UI flavour. No Radix package is installed.
- **The console's corners too.** `globals.css` keeps shadcn's radius scale (`--radius-sm` …
  `--radius-4xl`, each derived from `--radius`), with `--radius` at the 8px every console field
  uses, so a CLI component's `rounded-lg` is a field's corner. A fixed scale (it was 16px for
  `rounded-lg`) turns every added component into a pill.
- **The console's colours win.** `src/app/globals.css` maps shadcn's token names (`card`,
  `muted`, `accent`, `border`, `input`, `ring`, `destructive`, …) onto the console's semantic
  layer, so a newly added component renders in maroon and stone in both themes with no edits.

## Shape

- **`components.json`.** Style `base-nova`, Tailwind v4 CSS at `src/app/globals.css`, aliases
  `@/components/ui`, `@/lib/utils`, icons `lucide`. `bunx shadcn@latest info` reads it back.
- **Adding one:** `bunx shadcn@latest add <name>` from the repo root. Needs network access to
  `ui.shadcn.com`. Then review the diff: keep the component, revert anything it wrote into
  `globals.css` that replaces the console's palette, and swap registry colour classes for
  console tokens only where the mapping is not enough. Check its `cn` import too: on Windows
  the CLI wrote `import { cn } from "cn"` and installed the unrelated `cn` npm package instead
  of using the `@/lib/utils` alias. Point it back at `@/lib/utils` and revert `package.json`
  and `bun.lock`.
- **Never `shadcn init`.** It rewrites `globals.css` with the registry's own `oklch()` theme.
- **Inventory.** Ten were ported by hand in 14zcqntjnru before `components.json` existed
  (`skeleton` in 14zcqntjw73), and `pagination` in 14zcqntjw6w from the registry source,
  where the CLI could not reach `ui.shadcn.com`. They follow the registry items' structure
  and APIs, with
  console token classes (`bg-surface`, `text-stone-ink`, `border-stone-hair`) in place of the
  registry's. `native-select` came from the CLI; apart from its `cn` import, its only
  adaptation is to sit beside `Input` and `Button`: `h-9` (the registry ships `h-8`) on
  `bg-surface` (the registry ships transparent, with its own dark tints).

  | File                | Registry item   | Base UI primitive | Source             |
  | ------------------- | --------------- | ----------------- | ------------------ |
  | `alert-dialog.tsx`  | `alert-dialog`  | `alert-dialog`    | hand-ported        |
  | `badge.tsx`         | `badge`         | none              | hand-ported        |
  | `button.tsx`        | `button`        | `button`          | hand-ported        |
  | `card.tsx`          | `card`          | none              | hand-ported        |
  | `dropdown-menu.tsx` | `dropdown-menu` | `menu`            | hand-ported        |
  | `input.tsx`         | `input`         | `input`           | hand-ported        |
  | `label.tsx`         | `label`         | none              | hand-ported        |
  | `native-select.tsx` | `native-select` | none              | CLI (`shadcn add`) |
  | `pagination.tsx`    | `pagination`    | none              | hand-ported        |
  | `separator.tsx`     | `separator`     | `separator`       | hand-ported        |
  | `skeleton.tsx`      | `skeleton`      | none              | hand-ported        |
  | `spinner.tsx`       | `spinner`       | none (lucide)     | hand-ported        |
  | `table.tsx`         | `table`         | none              | hand-ported        |

- **`spinner`** was ported from the registry's `base` source (lucide's `Loader2Icon`) in
  14zcqntk6h5, where the CLI could not reach `ui.shadcn.com`; only its `cn` import changed.
  `LinkPending` and the sidebar use it for a pending navigation.
- **Loading states** compose `Skeleton` and `Card` into page shapes in
  `src/components/loading/PageSkeletons.tsx` — header, filters, table, stat cards, chart
  cards — so every page's skeleton looks like that page and none is hand-drawn.
- **`pagination`'s page links** are `next/link` styled with `buttonVariants`, not a Base UI
  `Button` rendering an `<a>`: a page change keeps link semantics and is a client navigation,
  not a document reload.
- **Filters use `NativeSelect`.** The audit trail's person and action filters
  (`src/app/(dashboard)/audit/page.tsx`) and the super admin's organization filter
  (`src/components/organizations/OrganizationFilter.tsx`, on `/records`, `/dashboard`,
  `/export` and `/audit`) submit with their page's GET form, so they stay native selects.

## Connected to

- **Composed by** every folder under `src/components/` except `ui/`, and by pages in
  `src/app/`. Those compose; they never build a primitive.
- **Styled by** `src/app/globals.css` (`@theme inline`), shared with every component.
- **Looks like but is not** `src/components/records/`, `dashboard/`, `shell/`,
  `organizations/`: feature components. They hold console logic and layout, built from `ui/`.

## If you change this

**Hits**

- Every page that renders the component. Run the app in both themes.
- `src/components/ui/shadcn.test.ts`, which fails if:
  - a file in `ui/` is not a shadcn registry item;
  - anything outside `ui/` imports `@base-ui/`;
  - anything outside `ui/` renders a raw `<button>`, `<select>`, `<textarea>`, `<table>` or
    visible `<input>`;
  - `components.json` stops pointing at Base UI and these paths;
  - `globals.css` loses the console palette, or shadcn's radius scale.
- This card's inventory, in the same change.

**Does not hit**

- Domain rules or data reads. A primitive never imports a port, an adapter or `@/domain`.

## Surfaces

Developers and agents adding UI. The shadcn CLI reads `components.json`.

## See

`components.json`, `src/components/ui/`, `src/app/globals.css`, `docs/constraints.md` (#15).
