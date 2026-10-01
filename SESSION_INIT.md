# SESSION_INIT

Read once at session start. Do not re-read. This file routes; it carries no content.

## What this is

The **AgarthaVision Admin Console** — a desktop Next.js web app for the super admins and
organization admins of the AgarthaVision soil-transmitted helminth (STH) diagnostic system. A medical technologist
captures microscopy frames of a fecal smear through a phone on a microscope; an inference
model detects and classifies _Ascaris lumbricoides_, _Trichuris trichiura_ and Hookworm
eggs; a human validates every model output; each session reports a per-species range of
eggs per low-power field (LPF). The Android client is the medtech's tool. This console is
the surface for the people who run the system: a records browser (patient → session →
sample), a dashboard and a research export. It is read-only over clinical data.

## Repo / vault boundary

As-built documentation lives here, in `docs/`, and changes in the same commit as the code
it describes. Plans, sprint backlog and task tracking live in **ClickUp**, not in this
repo. Nothing in `docs/` is a proposal: if it is written here, it is built. Code is the
source of truth — when a card and the code disagree, the code wins and the card is wrong.

## Where to go

| Situation                                       | Open                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| Adding a feature or UI surface                  | `docs/features.md`, then the relevant `docs/map/objects/` card       |
| Adding or swapping a data/storage/auth provider | `docs/map/objects/provider-registry.md`, `docs/map/objects/ports.md` |
| Touching anything under `src/adapters/`         | `docs/map/effects/CONTEXT.md`                                        |
| Changing a domain entity or enum                | `docs/map/objects/domain-model.md`, `docs/constraints.md` (#5, #7)   |
| Changing what counts, LPF or session figures    | `docs/map/processes/lpf-session-summary.md`                          |
| Changing the export columns or file format      | `docs/map/processes/research-matrix-export.md`                       |
| Changing who can reach a route                  | `docs/map/processes/admin-gate.md`, `docs/constraints.md` (#3)       |
| Loading sample images                           | `docs/map/processes/signed-image-url.md`                             |
| Wondering what a command does                   | `docs/commands.md`                                                   |
| Wondering which versions are installed          | `docs/stack.md`                                                      |
| Wondering where a file lives                    | `docs/file-tree.md`                                                  |
| A hook rejected your commit                     | `docs/constraints.md` (#8, #9), `docs/commands.md`                   |
| Asking "may I do X?"                            | `docs/non-negotiables.md`                                            |
| Asking "what changed?"                          | `docs/CHANGELOG.md`                                                  |

## The 13 constraints

Names only. Full text and enforcement points: `docs/constraints.md`.

1. Ports before providers
2. Server-only secrets
3. Admin-only routes
4. Read-mostly console
5. Schema parity with AgarthaVision
6. Validated data only in reports
7. Migrations own the schema
8. Commit format
9. Hooks are not optional
10. Docs change in the same commit
11. Code wins over cards
12. No committed secrets
13. Router stays thin

## Reading budget

Router + one shelf file + one card should land in 2k–8k tokens. If you are reading more
than that to make one change, you opened the wrong card — come back to the table above.
