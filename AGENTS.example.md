# Personal workspace rules — <Your Name>

Gitignored. This is the per-developer layer; project truth lives in `SESSION_INIT.md` and
`docs/`. Copy this file to `AGENTS.md` to customize your local setup.

---

## Project shelf — keep it current (every agent, every tool)

Keep this section in your copy. It is written for any coding agent and any member, and needs no
special skill or plugin.

- **Start at `SESSION_INIT.md`.** Open its "Where to go" table, then **one** file under `docs/`,
  then **one** card under `docs/map/`. Do not read all of `docs/`.
- **When you change code, update the card that describes it in the same change.** Find it from
  the `SESSION_INIT.md` table or `docs/map/effects/CONTEXT.md`. If it has no `---` frontmatter
  block yet, add one. Then either:
  - re-check the card against the code and set its frontmatter `verified:` to today and
    `commit:` to the commit you checked, or
  - if you cannot re-check it, set `status: stale`.
- **Write the shelf in the diff, not at the end of the sprint.** A change to behaviour or a
  contract also adds a `docs/CHANGELOG.md` entry, and a new or removed feature updates
  `docs/features.md`. Rules: `docs/constraints.md` (#10).
- **Cite code by `path:line`,** e.g. `src/domain/epg.ts:33`, so a mismatch is cheap to find.
  Rules: `docs/constraints.md` (#11).
- **The code wins.** If a card disagrees with the code, fix the card and say what was wrong in one
  line. Never change code to match a card. A card that matches the code but not a newer plan is
  not stale — the plan is not built yet.
- **New behaviour gets a home.** A new noun gets a card under `docs/map/objects/`, a new flow a
  card under `docs/map/processes/`. Give it a row in the `SESSION_INIT.md` table and, if it
  changes what something breaks, in `docs/map/effects/CONTEXT.md`. Copy the shape of a
  neighbouring card.
- **Components come from shadcn, never from scratch.** Need a button, dialog, select, table,
  tooltip…? Check `docs/map/objects/ui-components.md`; if it is not in `src/components/ui/`,
  add it with `bunx shadcn@latest add <name>` and compose it. Never hand-build a primitive or
  import `@base-ui/` outside `ui/`. Rules: `docs/constraints.md` (#15).
- **Before you end the session,** list the files you changed and confirm each one's card, the
  changelog and `docs/features.md` say what the code now does.

## Second brain / vault

- **Location:** `<Path to your Obsidian Vault>`
- **Purpose:** plans, architecture rationale, domain decisions, review notes — the _why_, and
  anything sensitive. Server topology lives here, never in the repo.
- **Entry point:** `<vault>/AGENTS.md` routes; `<vault>/CONTEXT.md` is the milestone pipeline.

## Vault conventions

- **Obsidian-native:** use `[[wikilinks]]` between notes.
- **Index registration:** register new root notes in `<vault>/AGENTS.md`.
- **Naming:** `kebab-case.md` or `SCREAMING-KEBAB.md`.
- **Dates:** absolute, e.g. `YYYY-MM-DD`.
- **Append, don't overwrite:** preserve history; add dated sections for updates.

## Local environment

- **OS / shell:** <Your OS> / <Your Shell>.
- **Local Postgres 17**, database name ends in `_dev`.
- Keep scripts cross-platform — TypeScript run by Bun, not `.sh` or `.ps1`.
- Never point a dev script at the server; it runs production workloads.
