# Non-negotiables

Terse form. Reasons and enforcement points live in `docs/constraints.md`.

- Feature and UI code imports **ports**, never adapters, never a vendor SDK.
- No vendor type appears in `src/ports/`.
- Providers are constructed in `src/adapters/registry.ts` and nowhere else.
- An unknown provider name throws immediately, with the bad value in the message.
- No top-level `throw` on a missing env var. Missing env fails at request time, named.
- The service-role key never crosses into a client component.
- Every route under `(dashboard)` is gated server-side on console access (super admin or org
  admin). Route handlers repeat the check. A hidden link is not a gate.
- The console never writes clinical data. No insert, no update, no delete.
- Only `CONFIRMED` detections on validated samples count toward EPG and exports.
- Every report and export surface states the validation exclusion in the UI.
- Domain field names mirror the upstream Postgres schema. Do not invent columns.
- `validation_records` is not implemented upstream. Do not build against it.
- No migrations in this repo.
- Commit subject: `[type][ClickUp-ID][Lastname]: Task title`. No trailers.
- Never commit a real secret, or a plausible-looking fake one.
- Never bypass the hooks.
- Change the doc card in the same commit as the behavior.
- `SESSION_INIT.md` routes; it never explains.
