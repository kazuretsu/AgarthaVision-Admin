# Change impact

If you touch X, open these cards. This index is a catalog, not a waterfall: it names where
to look, and the card carries the reasoning. **If this table and a card disagree, the card
is right and this table is stale.**

| If you touch                                        | Open                                                                                    |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/ports/*`                                       | `../objects/ports.md` · `../../constraints.md` (#1, #4)                                 |
| `src/adapters/registry.ts`                          | `../objects/provider-registry.md`                                                       |
| `src/adapters/supabase/database.ts`                 | `../objects/domain-model.md` · `../objects/ports.md`                                    |
| `src/adapters/supabase/storage.ts`                  | `../processes/signed-image-url.md`                                                      |
| `src/adapters/supabase/auth.ts`                     | `../processes/admin-gate.md` · `../../constraints.md` (#3)                              |
| `src/domain/entities.ts`, `enums.ts`                | `../objects/domain-model.md` · `../../constraints.md` (#5, #7)                          |
| `src/domain/epg.ts`, `severity.ts`                  | `../processes/epg-aggregation.md` · `../../constraints.md` (#6)                         |
| `src/domain/research-matrix.ts`                     | `../processes/research-matrix-export.md` — the column set is a contract                 |
| `src/domain/filters.ts`, `src/lib/search-params.ts` | `../processes/research-matrix-export.md` — the export reuses the page's filter          |
| `src/app/(dashboard)/layout.tsx`                    | `../processes/admin-gate.md`                                                            |
| Any new route handler                               | `../processes/admin-gate.md` — handlers do **not** inherit the layout's gate            |
| `src/proxy.ts`                                      | `../processes/admin-gate.md` — refresh only, never the authorisation point              |
| `src/lib/palette.ts`, anything charting             | `../../constraints.md` (#11) — re-run the palette validator                             |
| `SESSION_INIT.md`                                   | `../../constraints.md` (#13)                                                            |
| `.husky/*`, `package.json` scripts                  | `../../commands.md` · `../../constraints.md` (#9)                                       |
| `.env.example`                                      | `../objects/provider-registry.md` · `../../stack.md` · `../../constraints.md` (#2, #12) |

## The four non-obvious breaks

**A route handler is not behind the gate.** The `(dashboard)` layout guards pages that
render inside it. A route handler under the same folder does not render inside it and
inherits nothing. `records/export` repeats `requireAdmin()` for exactly this reason; a new
handler that forgets to is an open dataset.

**An admin can read every row and no image.** Table RLS grants admins cross-user reads;
Storage RLS does not (`0003_storage_rls.sql` has no admin exception). The fix,
`0009_storage_admin_read.sql`, exists upstream but is applied by hand and **may not be
applied yet**. See `../processes/signed-image-url.md`.

**Three upstream renames bite silently.** `0002_verification_fields.sql` renamed
`roboflow_model_version` → `inference_model_version`, added `needs_reannotation`, and
**dropped** `detections.verified_by_user`. Code written against the old names compiles and
reads `undefined`.

**What counts toward EPG is cross-repo.** Only `CONFIRMED` detections count
(`src/domain/epg.ts:33`), matching the Android client's session reports. Changing that rule
here makes the two surfaces disagree about the same smear — it is a cross-repo behaviour
change, not a local one.

## What points into this tree from outside

Nothing in this repo references these, so nothing here would break loudly if they changed:

- **The AgarthaVision Android client and its Supabase project.** The real schema authority.
  A migration there is a change here.
- **ClickUp.** Task IDs appear in every commit subject; no code reads them.
- **Downstream consumers of the research-matrix export.** The column labels are a contract
  with analysts this repo cannot see.
