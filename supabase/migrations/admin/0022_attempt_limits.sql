-- admin/0022 · Failed sign-in and invitation attempts, counted to limit password guessing
--
-- Run via: Supabase dashboard → SQL Editor → paste → Run. By hand, once.
-- Requires: nothing before it in this repo; the Supabase roles (anon, authenticated,
-- service_role).
--
-- ── Why (14zcqntnqp6) ────────────────────────────────────────────────────────
-- The console's sign-in form and invitation page are server actions: they call Supabase Auth
-- from the host's servers, so Supabase's own per-IP limit sees the host, never the person
-- guessing. The console now counts each failed attempt itself, and refuses a new one before
-- the auth provider is called once there are, in the last 15 minutes:
--   * 5 failures for one email (sign-in and invitation together);
--   * 20 failures from one client IP;
--   * 5 wrong passwords on one invitation.
-- The limits and the window live in the console's code (`src/domain/attempt-limits.ts`); this
-- table only holds the failures, and this function only counts them.
--
-- ── What is stored ───────────────────────────────────────────────────────────
-- One row per failed attempt: when, which form, and SHA-256 hashes (hex) of the lower-cased
-- email, of the client IP (null when the host gave none) and, for an invitation, of its link
-- token (the same hash `console_invitation_token_hash` stores, admin/0005). No email, IP or
-- password is stored in the clear. A success erases nothing: rows older than the window are
-- simply not counted, so nothing is ever deleted.
--
-- ── Who may ──────────────────────────────────────────────────────────────────
-- The console's server only, with the SERVICE ROLE, as for accepting an invitation. Row level
-- security is on with no policies, and anon and authenticated have no privilege on the table
-- or the function: no browser can read, write or count attempts.
--
-- Additive only: one table, its indexes, one function.

begin;

create table public.console_sign_in_attempts (
    id          bigint generated always as identity primary key,
    at          timestamptz not null default now(),
    kind        text not null check (kind in ('sign_in', 'invitation')),
    email_hash  text not null check (email_hash ~ '^[0-9a-f]{64}$'),
    ip_hash     text check (ip_hash ~ '^[0-9a-f]{64}$'),
    token_hash  text check (token_hash ~ '^[0-9a-f]{64}$'),
    check (kind = 'invitation' or token_hash is null)
);

create index console_sign_in_attempts_email_idx on public.console_sign_in_attempts (email_hash, at);
create index console_sign_in_attempts_ip_idx on public.console_sign_in_attempts (ip_hash, at)
    where ip_hash is not null;
create index console_sign_in_attempts_token_idx on public.console_sign_in_attempts (token_hash, at)
    where token_hash is not null;

alter table public.console_sign_in_attempts enable row level security;

revoke all on public.console_sign_in_attempts from public, anon, authenticated;
grant select, insert on public.console_sign_in_attempts to service_role;

-- The failures since `p_since` for each key, in one call. A null key counts nothing.
create or replace function public.console_failed_attempts(
    p_email_hash text,
    p_ip_hash text,
    p_token_hash text,
    p_since timestamptz
)
returns table (by_email integer, by_ip integer, by_invitation integer)
language sql
stable
set search_path = public
as $$
    select
        (select count(*)::integer from public.console_sign_in_attempts a
          where p_email_hash is not null and a.email_hash = p_email_hash and a.at >= p_since),
        (select count(*)::integer from public.console_sign_in_attempts a
          where p_ip_hash is not null and a.ip_hash = p_ip_hash and a.at >= p_since),
        (select count(*)::integer from public.console_sign_in_attempts a
          where p_token_hash is not null and a.token_hash = p_token_hash
            and a.kind = 'invitation' and a.at >= p_since);
$$;

revoke execute on function public.console_failed_attempts(text, text, text, timestamptz)
    from public, anon, authenticated;
grant execute on function public.console_failed_attempts(text, text, text, timestamptz)
    to service_role;

commit;
