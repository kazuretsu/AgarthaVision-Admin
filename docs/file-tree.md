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
│       ├── objects/           One card per noun in the system.
│       ├── processes/         One card per real movement of data.
│       └── effects/CONTEXT.md Change-impact: touch X, open these cards.
└── src/
    ├── app/                   Routes. Server components by default.
    │   ├── layout.tsx         Root shell and metadata.
    │   ├── globals.css        Design tokens. The only file holding raw hex.
    │   └── page.tsx           Entry surface.
    ├── domain/                Entity types, enums, EPG and severity logic. No I/O.
    ├── ports/                 Pure interfaces: db, storage, auth. No vendor types.
    ├── adapters/
    │   ├── registry.ts        Env-driven provider selection. The only construction site.
    │   └── supabase/          The one concrete implementation this pass.
    ├── components/            Presentational components. Import ports, never adapters.
    └── lib/                   Request-time env accessors and small shared helpers.
```

Directories under `src/` that hold no committed file yet appear in this tree because they
are the agreed destinations; they are filled in later commits of this pass.
