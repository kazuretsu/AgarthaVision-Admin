# Change impact

If you touch X, open these cards. Cards land as the code they describe lands; this table
is filled in alongside them.

| If you touch                                    | Open                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `SESSION_INIT.md`                               | `docs/constraints.md` (#13)                                                     |
| `.husky/*`                                      | `docs/commands.md`, `docs/constraints.md` (#9)                                  |
| `package.json` scripts                          | `docs/commands.md`, `.husky/pre-commit`                                         |
| `src/app/globals.css`                           | `docs/stack.md` — tokens mirror the Android palette                             |
| `src/domain/enums.ts`, `src/domain/entities.ts` | `docs/constraints.md` (#5, #7) — the upstream migration is the authority        |
| `src/domain/epg.ts`, `src/domain/severity.ts`   | `docs/constraints.md` (#6) — validated data only                                |
| `src/domain/research-matrix.ts`                 | `docs/constraints.md` (#6) — the column set is a contract                       |
| `src/ports/*`                                   | `docs/constraints.md` (#1, #4) — every adapter must still satisfy the interface |
