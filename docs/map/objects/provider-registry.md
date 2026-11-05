---
verified: 2026-11-05
commit: 7e94643
---

# Provider registry

The one module feature code reaches a backend through: `src/adapters/registry.ts`. The only
other file that names a concrete backend is `src/proxy.ts`, which opens its
`RequestSessionPort` from `src/adapters/supabase/request-session.ts` directly (`src/proxy.ts:2`);
the registry has no getter for that port.

## Why this shape

If more than one file named a provider, "swap the database" would mean finding every one
of them. Feature code asks `getDatabase()` and receives a `DatabasePort`; it never learns
which implementation answered.

Adapters are imported **lazily** inside each getter (`src/adapters/registry.ts:80-169`).
Two reasons, both load-bearing: a future S3 or Postgres adapter must not drag its SDK into
the bundle of a deployment that does not use it, and an eager import would make this
module unimportable in a unit test that has no request context.

## Shape

Selection reads one variable per port, defaulting to the first supported entry
(`src/adapters/registry.ts:56-77`):

| Variable           | Getter               | Supported today                                     |
| ------------------ | -------------------- | --------------------------------------------------- |
| `DB_PROVIDER`      | `getDatabase()`      | `supabase`                                          |
| `STORAGE_PROVIDER` | `getStorage()`       | `supabase`                                          |
| `AUTH_PROVIDER`    | `getAuth()`          | `supabase`                                          |
| `DB_PROVIDER`      | `getAdminWrites()`   | `supabase` — the writes live in the reads' database |
| `AUTH_PROVIDER`    | `getOnboarding()`    | `supabase` — it makes the account in the auth store |
| `AUTH_PROVIDER`    | `getAccountAccess()` | `supabase` — the login it blocks lives there        |
| `DB_PROVIDER`      | `getAttemptLimit()`  | `supabase` — failed attempts are stored there       |
| `MAIL_PROVIDER`    | `getMail()`          | `resend`                                            |

An unrecognised value throws `UnknownProviderError` (`src/adapters/registry.ts:46`) rather
than falling back. A silent fallback would let a deployment believe it is pointed at one
backend while reading from another — the failure mode worth being loud about. Resolution
is case- and whitespace-insensitive, and a blank value counts as unset.

The data, storage, write, attempt-limit and account-access ports are handed out wrapped in
`timedPort` (`src/lib/timing.ts:34`), so each call logs its duration without any adapter
knowing (`src/adapters/registry.ts:84`, `:94`, `:117`, `:130`, `:156`). `getAuth()`,
`getOnboarding()` and `getMail()` return their adapter unwrapped.

Deferred by decision, not oversight: **Better Auth + Drizzle** and an **S3 adapter**. Both
are future work; adding either means a new adapter plus one branch here, and no caller
changes. Better Auth also needs its own request-session adapter, wired into `src/proxy.ts`.

## Connected to

- Returns: `docs/map/objects/ports.md`.
- Selects: `src/adapters/supabase/*`.
- Configured by: `.env.example`.

## If you change this

**Hits**

- `src/adapters/registry.test.ts` — selection and failure paths are pinned there.
- `.env.example` and `docs/stack.md` if a variable or a supported value changes.
- Nothing else. That is the point of the module.

**Does not hit**

- Any page, layout or component. They import the getters, not the branches.
- `src/proxy.ts` for a change of variable or branch here: it reads env directly, runs in a
  separate runtime with its own module graph, and deliberately does not route through the
  registry. A new auth provider does hit it, though: it imports the Supabase request-session
  adapter by name.

## Surfaces

Called from server components, layouts and route handlers. Never from a client component —
the getters reach adapters that hold credentials.

## See

`src/adapters/registry.ts`, `src/adapters/registry.test.ts`.
