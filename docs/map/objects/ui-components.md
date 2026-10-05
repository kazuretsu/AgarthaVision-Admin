---
verified: 2026-10-05
commit: d901563
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
- **The console's colours win.** `src/app/globals.css` maps shadcn's token names (`card`,
  `muted`, `accent`, `border`, `input`, `ring`, `destructive`, …) onto the console's semantic
  layer, so a newly added component renders in maroon and stone in both themes with no edits.

## Shape

- **`components.json`.** Style `base-nova`, Tailwind v4 CSS at `src/app/globals.css`, aliases
  `@/components/ui`, `@/lib/utils`, icons `lucide`. `bunx shadcn@latest info` reads it back.
- **Adding one:** `bunx shadcn@latest add <name>` from the repo root. Needs network access to
  `ui.shadcn.com`. Then review the diff: keep the component, revert anything it wrote into
  `globals.css` that replaces the console's palette, and swap registry colour classes for
  console tokens only where the mapping is not enough.
- **Never `shadcn init`.** It rewrites `globals.css` with the registry's own `oklch()` theme.
- **Inventory.** All ten were ported by hand in 14zcqntjnru before `components.json` existed
  (`skeleton` in 14zcqntjw73). They follow the registry items' structure and APIs, with
  console token classes (`bg-surface`, `text-stone-ink`, `border-stone-hair`) in place of the
  registry's.

  | File                | Registry item   | Base UI primitive |
  | ------------------- | --------------- | ----------------- |
  | `alert-dialog.tsx`  | `alert-dialog`  | `alert-dialog`    |
  | `badge.tsx`         | `badge`         | none              |
  | `button.tsx`        | `button`        | `button`          |
  | `card.tsx`          | `card`          | none              |
  | `dropdown-menu.tsx` | `dropdown-menu` | `menu`            |
  | `input.tsx`         | `input`         | `input`           |
  | `label.tsx`         | `label`         | none              |
  | `separator.tsx`     | `separator`     | `separator`       |
  | `skeleton.tsx`      | `skeleton`      | none              |
  | `table.tsx`         | `table`         | none              |

- **Waiting for their component.** `src/app/(dashboard)/audit/page.tsx` and
  `src/components/organizations/OrganizationFilter.tsx` still render a raw `<select>`; both
  need `native-select`. They are the test's known exceptions.

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
  - `globals.css` loses the console palette.
- This card's inventory, in the same change.

**Does not hit**

- Domain rules or data reads. A primitive never imports a port, an adapter or `@/domain`.

## Surfaces

Developers and agents adding UI. The shadcn CLI reads `components.json`.

## See

`components.json`, `src/components/ui/`, `src/app/globals.css`, `docs/constraints.md` (#15).
