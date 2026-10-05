# Non-negotiables

Terse form. Reasons and enforcement points live in `docs/constraints.md`.

- Feature and UI code imports **ports**, never adapters, never a vendor SDK.
- No vendor type appears in `src/ports/`.
- Providers are constructed in `src/adapters/registry.ts` and nowhere else.
- An unknown provider name throws immediately, with the bad value in the message.
- No top-level `throw` on a missing env var. Missing env fails at request time, named.
- The service-role key never crosses into a client component. Its only uses are making an
  invited person's account, after the link is checked, and banning or unbanning a medtech's
  login, after the rule is checked.
- Deactivating a medtech blocks their sign-in and deletes nothing.
- No sign-up. An account is made only by accepting an invitation; its role and organization
  come from the stored invitation, never from `user_metadata` or anything the invitee sends.
- Every route under `(dashboard)` is gated server-side on console access (super admin or org
  admin). Route handlers repeat the check. A hidden link is not a gate.
- The console never writes clinical data. No insert, no update, no delete.
- Every non-rejected detection on a live (not deleted) sample counts — the app's rule.
- LPF is a min–max range per field. Never a mean, never EPG, never a WHO tier.
- Every report and export surface states the validation exclusion in the UI.
- Domain field names mirror the upstream Postgres schema. Do not invent columns.
- `validation_records` is not implemented upstream. Do not build against it.
- Admin migrations only, in `supabase/migrations/admin/`, additive only. Never alter or drop
  an app-owned object; never apply a migration to a live project from a script.
- Every administrative write goes through `AdminWritePort` and is audited in the same
  transaction. No table the console writes has a client write policy.
- Commit subject: `[type][ClickUp-ID][Lastname]: Task title`. No trailers.
- Never commit a real secret, or a plausible-looking fake one.
- Never bypass the hooks.
- Change the doc card in the same commit as the behavior.
- `SESSION_INIT.md` routes; it never explains.
- UI primitives come from shadcn (`bunx shadcn@latest add`), never from scratch. Never run
  `shadcn init`.
