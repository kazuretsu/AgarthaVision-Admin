# File tree

Annotated. Generated directories (`.next/`, `node_modules/`, `coverage/`) are omitted.

```
.
├── SESSION_INIT.md            Router. Read once at session start. No content payload.
├── README.md                  Public-facing intro and quickstart.
├── .env.example               Variable names, empty values. The only tracked env file.
├── .gitignore                 Ignores .env* with a single !.env.example exception.
├── .husky/
│   ├── pre-commit             ① typecheck ② test ③ build ④ lint. Each step exits 1 on failure.
│   ├── commit-msg             Enforces [type][ClickUp-ID][Lastname] Task title.
│   └── pre-push               Full production build before push.
├── commitlint.config.js       Conventional config plus this repo's scope-enum.
├── lint-staged.config.js      **/*.{ts,tsx} → eslint --fix, prettier --write.
├── eslint.config.mjs          next/core-web-vitals + next/typescript + prettier.
├── next.config.ts             Minimal. Strict mode on.
├── postcss.config.mjs         Tailwind v4 PostCSS plugin.
├── vitest.config.ts           Node environment, src/**/*.test.ts, @ alias.
├── tsconfig.json              strict, bundler resolution, @/* → src/*.
├── docs/
│   ├── constraints.md         The 13 constraints in full, each with its enforcement point.
│   ├── non-negotiables.md     Terse absolute rules.
│   ├── stack.md               Tech stack with resolved versions, and the deferrals.
│   ├── commands.md            Every runnable command.
│   ├── features.md            What exists today.
│   ├── CHANGELOG.md           What changed, newest first.
│   ├── file-tree.md           This file.
│   └── map/
│       ├── objects/
│       │   ├── domain-model.md        Entities and enums, mirrored from upstream migrations.
│       │   ├── ports.md               The three interfaces and their error types.
│       │   └── provider-registry.md   How a backend is selected, and why lazily.
│       ├── processes/
│       │   ├── epg-aggregation.md     Count → multiply → group. What counts, and why.
│       │   ├── research-matrix-export.md  Filter → rows → CSV/JSON. The column contract.
│       │   ├── admin-gate.md          Refresh → identity → role. Where the gate lives.
│       │   └── signed-image-url.md    Why one adapter is privileged, and until when.
│       └── effects/CONTEXT.md         Change-impact: touch X, open these cards.
└── src/
    ├── proxy.ts               Session refresh (Next 16 convention). NOT the auth gate.
    ├── app/
    │   ├── layout.tsx         Root shell and metadata.
    │   ├── globals.css        Design tokens. The only file holding raw hex.
    │   ├── page.tsx           Public entry surface.
    │   ├── (auth)/login/      Sign-in form, server action, and its form state.
    │   └── (dashboard)/       Everything behind requireAdmin().
    │       ├── layout.tsx     The admin gate. Guards every page in this segment.
    │       ├── dashboard/     Summary cards, EPG trend, distribution, severity.
    │       └── records/       Filterable table, plus export/route.ts (gate repeated).
    ├── domain/                Entity types, enums, EPG and severity logic. No I/O.
    ├── ports/                 Pure interfaces: db, storage, auth. No vendor types.
    ├── adapters/
    │   ├── registry.ts        Env-driven provider selection. The only construction site.
    │   └── supabase/          client, env, database, storage, auth.
    ├── components/            Presentational. Import ports, never adapters.
    │   └── charts/            Inline SVG. No charting dependency.
    └── lib/
        ├── env.ts             Request-time accessors. Nothing throws at module load.
        ├── palette.ts         Validated chart colors, with the validator's findings.
        └── search-params.ts   Filter ⇄ query string, defensively parsed.
```

Every directory listed above holds committed files.
