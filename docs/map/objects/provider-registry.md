---
verified: 2026-09-30
commit: e5e0d2d
---

# Provider registry

The one module that names a concrete backend: `src/adapters/registry.ts`.

## Why this shape

If more than one file named a provider, "swap the database" would mean finding every one
of them. Feature code asks `getDatabase()` and receives a `DatabasePort`; it never learns
which implementation answered.

Adapters are imported **lazily** inside each getter (`src/adapters/registry.ts:61-102`).
Two reasons, both load-bearing: a future S3 or Postgres adapter must not drag its SDK into
the bundle of a deployment that does not use it, and an eager import would make this
module unimportable in a unit test that has no request context.

## Shape

Selection reads one variable per port, defaulting to the first supported entry
(`src/adapters/registry.ts:41-46`):

| Variable           | Getter               | Supported today                                     |
| ------------------ | -------------------- | --------------------------------------------------- |
| `DB_PROVIDER`      | `getDatabase()`      | `supabase`                                          |
| `STORAGE_PROVIDER` | `getStorage()`       | `supabase`                                          |
| `AUTH_PROVIDER`    | `getAuth()`          | `supabase`                                          |
| `DB_PROVIDER`      | `getAdminWrites()`   | `supabase` — the writes live in the reads' database |
| `AUTH_PROVIDER`    | `getOnboarding()`    | `supabase` — it makes the account in the auth store |
| `AUTH_PROVIDER`    | `getAccountAccess()` | `supabase` — the login it blocks lives there        |
| `MAIL_PROVIDER`    | `getMail()`          | `resend`                                            |

An unrecognised value throws `UnknownProviderError` (`src/adapters/registry.ts:31`) rather
than falling back. A silent fallback would let a deployment believe it is pointed at one
backend while reading from another — the failure mode worth being loud about. Resolution
is case- and whitespace-insensitive, and a blank value counts as unset.

Deferred by decision, not oversight: **Better Auth + Drizzle** and an **S3 adapter**. Both
are future work; adding either means a new adapter plus one branch here, and no caller
changes.

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
- `src/proxy.ts`, which reads env directly: it runs in a separate runtime with its own
  module graph and deliberately does not route through the registry.

## Surfaces

Called from server components, layouts and route handlers. Never from a client component —
the getters reach adapters that hold credentials.

## See

`src/adapters/registry.ts`, `src/adapters/registry.test.ts`.
