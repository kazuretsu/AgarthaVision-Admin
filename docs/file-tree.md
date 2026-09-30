# File tree

Annotated. Generated directories (`.next/`, `node_modules/`, `coverage/`) are omitted.

```
.
├── SESSION_INIT.md            Router. Read once at session start. No content payload.
├── README.md                  Public-facing intro and quickstart.
├── .env.example               Variable names, empty values. The only tracked env file.
├── .gitignore                 Ignores .env*, .mcp.json, AGENTS.md, .claude/. Templates stay tracked.
├── .mcp.example.json          MCP server template. Copy to .mcp.json and fill in the key.
├── AGENTS.example.md          Per-developer rules template. Copy to AGENTS.md.
├── .husky/
│   ├── pre-commit             ① typecheck ② test ③ build ④ lint. Each step exits 1 on failure.
│   ├── commit-msg             Enforces [type][ClickUp-ID][Lastname]: Task title.
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
│       │   ├── lpf-session-summary.md What counts, and the LPF range, as the app does it.
│       │   ├── dashboard-figures.md   Per-smear counting, and why not to sum the map's rows.
│       │   ├── epg-aggregation.md     Legacy EPG, export only.
│       │   ├── research-matrix-export.md  Filter → rows → CSV/JSON. The column contract.
│       │   ├── admin-gate.md          Refresh → identity → role. Where the gate lives.
│       │   └── signed-image-url.md    Why one adapter is privileged, and until when.
│       └── effects/CONTEXT.md         Change-impact: touch X, open these cards.
└── src/
    ├── proxy.ts               Session refresh (Next 16 convention). NOT the auth gate.
    ├── app/
    │   ├── layout.tsx         Root shell and metadata.
    │   ├── globals.css        Design tokens. The only file holding raw hex.
    │   ├── page.tsx           Redirects to /dashboard; the gate decides from there.
    │   ├── (auth)/login/      Sign-in form, server action, and its form state.
    │   └── (dashboard)/       Everything behind the console gate.
    │       ├── layout.tsx     The gate and the shell. Guards every page in this segment.
    │       ├── error.tsx      Error boundary: a failed read shows a retry, not a bare page.
    │       ├── dashboard/     Per-smear cards, weekly trend, species mix, period filter.
    │       └── records/       Patients list; patients/, sessions/, samples/ detail pages;
    │                          loading.tsx; export/route.ts (legacy EPG export, gate repeated).
    ├── domain/                Entities, read models, access rules, clinical (LPF),
    │                          patient and dashboard rules, id checks; legacy EPG for the export. No I/O.
    ├── ports/                 Pure interfaces: db, storage, auth. No vendor types.
    ├── adapters/
    │   ├── registry.ts        Env-driven provider selection. The only construction site.
    │   └── supabase/          client, env, database, storage, auth.
    ├── components/            Presentational. Import ports, never adapters.
    │   ├── ui/                shadcn components on Base UI. Ours to edit.
    │   ├── shell/             Sidebar nav (with who sees each entry) and the user menu.
    │   ├── records/           LPF table, field image with box overlay, breadcrumbs.
    │   ├── dashboard/         Stat card, weekly trend chart (inline SVG), species mix.
    │   ├── theme-provider.tsx next-themes, class-based.
    └── lib/
        ├── env.ts             Request-time accessors. Nothing throws at module load.
        ├── console-access.ts  requirePageAccess / requireRouteAccess, one lookup per request.
        ├── utils.ts           cn(): clsx + tailwind-merge.
        ├── format.ts          Dates in Asia/Manila, person names.
        ├── signed-urls.ts     Signs a page's frames; an unreadable one becomes null.
        ├── palette.ts         Validated species colours, with the validator's findings.
        ├── period.ts          The dashboard's from/to dates, defensively parsed.
        └── search-params.ts   Filter ⇄ query string, defensively parsed.
```

Every directory listed above holds committed files.
