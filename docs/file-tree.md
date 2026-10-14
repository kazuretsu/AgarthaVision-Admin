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
├── components.json            shadcn CLI config: Base UI (base-nova), aliases, globals.css.
├── .husky/
│   ├── pre-commit             ① typecheck ② test ③ build ④ lint. Each step exits 1 on failure.
│   ├── commit-msg             Enforces [type][ClickUp-ID][Lastname]: Task title.
│   └── pre-push               Full production build before push.
├── commitlint.config.js       Conventional config plus this repo's scope-enum.
├── scripts/
│   ├── db-test.ts             bun run test:db. Local databases only.
│   ├── geo/build-map-data.ts  Map boundaries and the area lookup, from the app repo's tools/geo.
│   └── vendor-maplibre.ts     Copies MapLibre's worker into public/vendor/.
├── public/
│   ├── geo/q2_2026/           Boundaries: regions.json, provinces.json, towns/<province>.json.
│   └── vendor/maplibre-gl/    MapLibre's worker, as the package ships it (vendor.test.ts).
├── supabase/
│   ├── migrations/admin/      This repo's own migrations, additive only (D4).
│   └── tests/                 SQL tests (and TS parity tests), Supabase stubs, helpers, seed.
├── lint-staged.config.js      **/*.{ts,tsx} → eslint --fix, prettier --write.
├── eslint.config.mjs          next/core-web-vitals + next/typescript + prettier.
├── next.config.ts             Minimal. Strict mode on.
├── postcss.config.mjs         Tailwind v4 PostCSS plugin.
├── vitest.config.ts           Node environment, src/**/*.test.ts, @ alias.
├── tsconfig.json              strict, bundler resolution, @/* → src/*.
├── docs/
│   ├── constraints.md         The 15 constraints in full, each with its enforcement point.
│   ├── non-negotiables.md     Terse absolute rules.
│   ├── stack.md               Tech stack with resolved versions, and the deferrals.
│   ├── commands.md            Every runnable command.
│   ├── features.md            What exists today.
│   ├── CHANGELOG.md           What changed, newest first.
│   ├── file-tree.md           This file.
│   └── map/
│       ├── objects/
│       │   ├── domain-model.md        Entities and enums, mirrored from upstream migrations.
│       │   ├── organizations.md       Labs, members, patient ownership, the audit log.
│       │   ├── ports.md               The interfaces and their error types.
│       │   └── provider-registry.md   How a backend is selected, and why lazily.
│       ├── processes/
│       │   ├── lpf-session-summary.md What counts, and the LPF range, as the app does it.
│       │   ├── dashboard-figures.md   Per-smear counting, and why not to sum the map's rows.
│       │   ├── lab-scoping.md         Who sees which laboratory's records, enforced twice.
│       │   ├── audit-trail.md         What is recorded, by whom, and why exports fail closed.
│       │   ├── invitations.md         Invite → email → set a password → membership. No sign-up.
│       │   ├── people-access.md       The People page; deactivate = ban the login, record, undo.
│       │   ├── patient-assignment.md  Who sees a patient in the app; never nobody; access only.
│       │   ├── research-export.md     Period → smears → CSV/JSON. The v2 column contract.
│       │   ├── training-data.md       Filter → label rules → split → frozen snapshot → zip.
│       │   ├── prevalence-map.md      Barangay → town → province → region, withheld under 5.
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
    │   ├── (auth)/invite/     [token]/ accept page and action (outside the gate); joined/.
    │   └── (dashboard)/       Everything behind the console gate.
    │       ├── layout.tsx     The gate and the shell. Guards every page in this segment.
    │       ├── error.tsx      Error boundary: a failed read shows a retry, not a bare page.
    │       ├── not-found.tsx  The 404 page: the same words for every reason, a way back.
    │       ├── dashboard/     Per-smear cards, weekly trend, species mix, period filter;
    │                          loading.tsx. audit/ and export/ have one too.
    │       ├── map/           The prevalence map: Region → Province → City/Municipality.
    │                          No loading.tsx: an unknown area's 404 must stay a 404.
    │       ├── records/       (list)/ patients list and its loading.tsx; patients/,
    │                          sessions/, samples/ detail pages (frames under Suspense).
    │       ├── export/        Research export page; download/route.ts (gate repeated).
    │       ├── training-data/ Super admin: filter, preview, snapshots; the create action;
    │                          snapshots/[snapshotId]/download/route.ts streams the zip.
    │                          No loading.tsx: an org admin's 404 must stay a 404.
    │       ├── organizations/ Super admin: list, detail (invitations too), audited actions.
    │                          No loading.tsx: an org admin's 404 must stay a 404.
    │       ├── people/        (list)/ a laboratory's people and its loading.tsx: invite,
    │                          search, role filter, sort, deactivate; [userId]/ one person and
    │                          their assigned patients; the member-status action.
    │       ├── assignments/   Assign, remove and hand-over server actions (no page).
    │       ├── invitations/   Invite, re-send and revoke server actions (no page).
    │       └── audit/         The audit trail, filtered and scoped.
    ├── domain/                Entities, read models, access rules, clinical (LPF),
    │                          patient, dashboard, research-export, training-data and
    │                          prevalence-map rules,
    │                          the training zip's files, id checks.
    │                          No I/O.
    ├── ports/                 Pure interfaces: db (read), admin-write, storage, auth, onboarding,
    │                          mail, account-access. No vendor types.
    ├── adapters/
    │   ├── registry.ts        Env-driven provider selection. The only construction site.
    │   ├── supabase/          client (and the one service client), env, database (paged reads in
    │   │                      paging.ts), reports and prevalence-rows (row mapping), admin-write, storage, auth,
    │   │                      onboarding (accepting an invitation), account-access (bans),
    │   │                      errors (a migration not applied yet).
    │   └── resend/            mail: the invitation email, over Resend's HTTP API.
    ├── components/            Presentational. Import ports, never adapters.
    │   ├── ui/                shadcn components on Base UI, added with the CLI (#15); shadcn.test.ts.
    │   ├── organizations/     Create, rename and deactivate forms; the super admin's org filter.
    │   ├── invitations/       Invite form, invitations table with re-send/revoke, accept form.
    │   ├── people/            The people table (sortable, paged) and the deactivate form.
    │   ├── loading/           Page-shaped skeletons (PageSkeletons) and LinkPending, the
    │                          spinner on a clicked link while its page decides 404.
    │   ├── assignments/       Who is assigned to a patient, with assign/remove/hand over.
    │   ├── shell/             Sidebar nav (with who sees each entry), the user menu, and the
    │   │                      not-found page's way back to the visitor's section.
    │   ├── records/           Patient list (one page) and its skeleton, LPF table, field image
    │                          with box overlay, breadcrumbs.
    │   ├── dashboard/         Stat card, weekly trend chart (inline SVG), species mix.
    │   ├── training/          Training data filter, preview, create form, snapshots table.
    │   ├── map/               PrevalenceMap (MapLibre), its legend, the areas table.
    │   ├── theme-provider.tsx next-themes, class-based.
    └── lib/
        ├── env.ts             Request-time accessors. Nothing throws at module load.
        ├── console-access.ts  requirePageAccess / requireRouteAccess, one lookup per request.
        ├── read-scope.ts      The actor and the ReadScope their reads run in.
        ├── utils.ts           cn(): clsx + tailwind-merge.
        ├── format.ts          Dates in Asia/Manila, person names.
        ├── pagination.ts      Page arithmetic: ?page= parsing, offsets, ranges, page links.
        ├── signed-urls.ts     Signs a page's frames; an unreadable one becomes null.
        ├── invitation-email.ts The invitation email: the link, never a password.
        ├── site-url.ts        The console's public origin, for the link.
        ├── palette.ts         Validated species colours, with the validator's findings.
        ├── period.ts          The dashboard's and export's from/to dates, defensively parsed.
        ├── map/               The map's validated colours; vendor.test.ts for the worker copy.
        ├── training-filter.ts The training data filter in the query string, both ways.
        └── training-zip.ts    A snapshot as a streamed zip (fflate).
```

Every directory listed above holds committed files.
