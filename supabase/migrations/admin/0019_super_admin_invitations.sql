-- admin/0019 · Granting and revoking super admin: by invitation, guarded and recorded
--
-- Run via: Supabase dashboard → SQL Editor → paste → Run. By hand, once.
-- Requires: admin/0001 (console_write_audit), admin/0005 (the invitation helpers); the app's
-- 0014_super_admins.sql (super_admins, is_admin()).
--
-- ── Why (14zcqntjwjg, D22) ───────────────────────────────────────────────────
-- The first super admins were granted by hand in the SQL editor. Every later one is invited
-- from the console by a super admin, with stricter rules than a laboratory invitation, because
-- super admin is the most powerful tier: it creates and deactivates laboratories and reads
-- every laboratory's records de-identified (D19).
--
-- ── The rules ────────────────────────────────────────────────────────────────
--   * Only a SUPER ADMIN invites, re-sends, withdraws or revokes. Checked in the console and
--     again here; anyone else is refused with 42501.
--   * An invitation works for 72 hours (a laboratory's works for 7 days) and can be withdrawn
--     before it is used. Its link is a random token stored only as its SHA-256, as in admin/0005.
--   * The invitee sets their own password; accepting adds their `super_admins` row, with
--     `granted_by` the inviter. It adds no laboratory membership and changes nothing in
--     `organization_members`. An email that already has an account in a laboratory or is
--     already a super admin cannot be invited (`console_email_taken`).
--   * Nobody revokes themselves, and the last active super admin cannot be revoked. Revoking
--     locks every active grant first, so two super admins revoking each other at the same
--     moment cannot leave none.
--   * Every invitation, re-send, withdrawal, grant and revocation is written to the audit log
--     with no organization: these events belong to no laboratory, so only super admins read
--     them (admin/0001's policies).
--
-- ── Nothing is deleted (C8) ──────────────────────────────────────────────────
-- An invitation is withdrawn, never deleted; a grant is revoked by setting `revoked_at`, and
-- the app's trigger refuses anything else. No table policy allows a write.
--
-- Additive only: one new table and new functions. `super_admins` is the app's table; this file
-- inserts and revokes rows in it, through the functions below, and changes nothing else in it.

begin;


-- ── super_admin_invitations ──────────────────────────────────────────────────
create table public.super_admin_invitations (
    id           uuid primary key default gen_random_uuid(),
    -- Stored as it will be compared: trimmed and lower-case.
    email        text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    full_name    text check (full_name is null or length(full_name) between 1 and 120),
    token_hash   text not null unique,
    status       text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
    expires_at   timestamptz not null,
    invited_by   uuid references public.profiles(id) on delete set null,
    invited_at   timestamptz not null default now(),
    sent_count   integer not null default 1,
    last_sent_at timestamptz not null default now(),
    accepted_by  uuid references public.profiles(id) on delete set null,
    accepted_at  timestamptz,
    revoked_by   uuid references public.profiles(id) on delete set null,
    revoked_at   timestamptz
);

create index super_admin_invitations_invited_idx on public.super_admin_invitations (invited_at desc);
create index super_admin_invitations_email_idx on public.super_admin_invitations (email);

-- How long a super admin link works, from the moment it is sent.
create or replace function public.console_super_admin_invitation_ttl()
returns interval
language sql
immutable
as $$ select interval '72 hours' $$;

-- Whether this email has a live invitation of either kind.
create or replace function public.console_email_has_pending_invitation(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (select 1 from public.organization_invitations i
                   where i.email = lower(btrim(p_email)) and i.status = 'pending' and i.expires_at > now())
        or exists (select 1 from public.super_admin_invitations i
                   where i.email = lower(btrim(p_email)) and i.status = 'pending' and i.expires_at > now());
$$;

revoke execute on function public.console_email_has_pending_invitation(text) from public, anon, authenticated;


-- ── Row Level Security ───────────────────────────────────────────────────────
-- Super admins read every invitation, never the token hash. Writes go through the functions.
alter table public.super_admin_invitations enable row level security;

revoke all on public.super_admin_invitations from anon, authenticated;
grant select (id, email, full_name, status, expires_at, invited_by, invited_at, sent_count,
              last_sent_at, accepted_by, accepted_at, revoked_by, revoked_at)
    on public.super_admin_invitations to authenticated;

create policy "super_admin_invitations: super admin reads all"
on public.super_admin_invitations for select to authenticated
using ( public.is_admin(auth.uid()) );


-- ── The active super admins ──────────────────────────────────────────────────
-- `super_admins` is closed to every client (app 0014). A super admin reads who the others are,
-- and who granted them, through this; anyone else is refused.
create or replace function public.console_list_super_admins()
returns table (
    user_id          uuid,
    full_name        text,
    email            text,
    granted_at       timestamptz,
    granted_by       uuid,
    granted_by_label text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
    if not public.is_admin(auth.uid()) then
        raise exception 'Only a super admin can list super admins' using errcode = '42501';
    end if;
    return query
    select s.user_id,
           nullif(btrim(p.full_name), ''),
           u.email::text,
           s.granted_at,
           s.granted_by,
           (select coalesce(nullif(btrim(gp.full_name), ''), gu.email::text)
              from public.profiles gp left join auth.users gu on gu.id::text = gp.account_id
             where gp.id = s.granted_by)
    from public.super_admins s
    join public.profiles p on p.id = s.user_id
    left join auth.users u on u.id::text = p.account_id
    where s.revoked_at is null
    order by s.granted_at;
end;
$$;


-- ── Invite ───────────────────────────────────────────────────────────────────
-- Returns the token once, for the console to email. Errors carry a HINT naming the case, as
-- admin/0005's do: `email`, `name`, `account_exists`, `invitation_pending`.
create or replace function public.console_invite_super_admin(p_email text, p_full_name text)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
    v_actor   uuid := auth.uid();
    v_email   text := lower(btrim(coalesce(p_email, '')));
    v_name    text := nullif(regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g'), '');
    v_token   text := public.console_new_invitation_token();
    v_id      uuid;
    v_expires timestamptz := now() + public.console_super_admin_invitation_ttl();
begin
    if not public.is_admin(v_actor) then
        raise exception 'Only a super admin can invite a super admin' using errcode = '42501';
    end if;
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'Not an email address' using errcode = '22023', hint = 'email';
    end if;
    if v_name is not null and length(v_name) > 120 then
        raise exception 'Name too long' using errcode = '22023', hint = 'name';
    end if;

    -- The same lock as a laboratory invitation, so the two kinds cannot race for one address.
    perform pg_advisory_xact_lock(hashtext('console_invite:' || v_email));

    if public.console_email_taken(v_email) then
        raise exception 'This email already has an account' using errcode = '23505', hint = 'account_exists';
    end if;
    if public.console_email_has_pending_invitation(v_email) then
        raise exception 'This email already has a pending invitation'
            using errcode = '23505', hint = 'invitation_pending';
    end if;

    insert into public.super_admin_invitations (email, full_name, token_hash, expires_at, invited_by)
    values (v_email, v_name, public.console_invitation_token_hash(v_token), v_expires, v_actor)
    returning id into v_id;

    perform public.console_write_audit(
        'super_admin.invite', 'super_admin_invitation', v_id::text, null,
        jsonb_build_object('email', v_email, 'name', v_name));

    return query select v_id, v_token, v_expires;
end;
$$;


-- ── Re-send ──────────────────────────────────────────────────────────────────
-- A new token and a new 72 hours; the previous link stops working. At most one email a minute.
create or replace function public.console_resend_super_admin_invitation(p_id uuid)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
    v_actor   uuid := auth.uid();
    v_inv     public.super_admin_invitations;
    v_token   text := public.console_new_invitation_token();
    v_expires timestamptz := now() + public.console_super_admin_invitation_ttl();
begin
    if not public.is_admin(v_actor) then
        raise exception 'Only a super admin can re-send a super admin invitation' using errcode = '42501';
    end if;
    select * into v_inv from public.super_admin_invitations i where i.id = p_id for update;
    if not found then
        raise exception 'Invitation % does not exist', p_id using errcode = 'P0002';
    end if;
    if v_inv.status <> 'pending' then
        raise exception 'Invitation is %', v_inv.status using errcode = '22023', hint = v_inv.status;
    end if;
    if public.console_email_taken(v_inv.email) then
        raise exception 'This email already has an account' using errcode = '23505', hint = 'account_exists';
    end if;
    if v_inv.last_sent_at > now() - public.console_resend_interval() then
        raise exception 'Sent less than a minute ago' using errcode = '22023', hint = 'too_soon';
    end if;

    update public.super_admin_invitations i
    set token_hash   = public.console_invitation_token_hash(v_token),
        expires_at   = v_expires,
        sent_count   = i.sent_count + 1,
        last_sent_at = now()
    where i.id = p_id;

    perform public.console_write_audit(
        'super_admin.invite_resend', 'super_admin_invitation', p_id::text, null,
        jsonb_build_object('email', v_inv.email));

    return query select v_token, v_expires;
end;
$$;


-- ── Withdraw ─────────────────────────────────────────────────────────────────
create or replace function public.console_revoke_super_admin_invitation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor uuid := auth.uid();
    v_inv   public.super_admin_invitations;
begin
    if not public.is_admin(v_actor) then
        raise exception 'Only a super admin can withdraw a super admin invitation' using errcode = '42501';
    end if;
    select * into v_inv from public.super_admin_invitations i where i.id = p_id for update;
    if not found then
        raise exception 'Invitation % does not exist', p_id using errcode = 'P0002';
    end if;
    if v_inv.status <> 'pending' then
        raise exception 'Invitation is %', v_inv.status using errcode = '22023', hint = v_inv.status;
    end if;

    update public.super_admin_invitations
    set status = 'revoked', revoked_by = v_actor, revoked_at = now()
    where id = p_id;

    perform public.console_write_audit(
        'super_admin.invite_revoke', 'super_admin_invitation', p_id::text, null,
        jsonb_build_object('email', v_inv.email));
end;
$$;


-- ── Look up a link ───────────────────────────────────────────────────────────
-- What the accept page shows before anyone has an account, so it is open to `anon`, as
-- admin/0005's `console_invitation_by_token` is. No row means no such link.
create or replace function public.console_super_admin_invitation_by_token(p_token text)
returns table (email text, full_name text, state text, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
    select i.email, i.full_name,
           case
               when i.status <> 'pending' then i.status
               when i.expires_at <= now() then 'expired'
               else 'pending'
           end,
           i.expires_at
    from public.super_admin_invitations i
    where i.token_hash = public.console_invitation_token_hash(p_token);
$$;


-- ── Accept ───────────────────────────────────────────────────────────────────
-- Run as the invitee, signed in with the account made for this email. The grant's
-- `granted_by` is the inviter, from the invitation row.
create or replace function public.console_accept_super_admin_invitation(p_token text, p_full_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor uuid := auth.uid();
    v_inv   public.super_admin_invitations;
    v_email text;
    v_name  text := nullif(regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g'), '');
begin
    if v_actor is null then
        raise exception 'Sign in to accept an invitation' using errcode = '42501';
    end if;

    select * into v_inv from public.super_admin_invitations i
    where i.token_hash = public.console_invitation_token_hash(p_token)
    for update;
    if not found then
        raise exception 'No such invitation' using errcode = 'P0002';
    end if;
    if v_inv.status <> 'pending' then
        raise exception 'Invitation is %', v_inv.status using errcode = '22023', hint = v_inv.status;
    end if;
    if v_inv.expires_at <= now() then
        raise exception 'Invitation has expired' using errcode = '22023', hint = 'expired';
    end if;

    select lower(u.email) into v_email from auth.users u where u.id = v_actor;
    if v_email is distinct from v_inv.email then
        raise exception 'This invitation is for another email address' using errcode = '42501';
    end if;
    -- A grant gives no membership, and a member is not made a super admin by a side door.
    if exists (select 1 from public.organization_members m where m.user_id = v_actor) then
        raise exception 'Already a member of an organization' using errcode = '23505', hint = 'already_member';
    end if;
    if v_name is not null and length(v_name) > 120 then
        raise exception 'Name too long' using errcode = '22023', hint = 'name';
    end if;

    -- Already one (a grant made by hand since the invitation): nothing to add.
    if not public.is_admin(v_actor) then
        insert into public.super_admins (user_id, granted_by) values (v_actor, v_inv.invited_by);
    end if;

    update public.profiles
    set full_name = coalesce(v_name, v_inv.full_name, full_name)
    where id = v_actor;

    update public.super_admin_invitations
    set status = 'accepted', accepted_by = v_actor, accepted_at = now()
    where id = v_inv.id;

    perform public.console_write_audit(
        'super_admin.grant', 'user', v_actor::text, null,
        jsonb_build_object('email', v_inv.email, 'invitation_id', v_inv.id,
                           'granted_by', v_inv.invited_by));
end;
$$;


-- ── Revoke ───────────────────────────────────────────────────────────────────
-- Refused with hint `self` for the caller's own grant and `last_super_admin` when it is the
-- only active one left; P0002 for someone who is not a super admin.
create or replace function public.console_revoke_super_admin(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor uuid := auth.uid();
    v_label text;
begin
    -- Lock every active grant before anything is read, so a concurrent revocation waits here
    -- and then sees what that one left.
    perform 1 from public.super_admins s where s.revoked_at is null for update;

    -- Checked after the lock: a caller revoked a moment ago is no longer a super admin.
    if not exists (select 1 from public.super_admins s
                   where s.user_id = v_actor and s.revoked_at is null) then
        raise exception 'Only a super admin can revoke a super admin' using errcode = '42501';
    end if;
    if p_user = v_actor then
        raise exception 'Nobody revokes their own super admin access'
            using errcode = '42501', hint = 'self';
    end if;
    if not exists (select 1 from public.super_admins s
                   where s.user_id = p_user and s.revoked_at is null) then
        raise exception 'User % is not a super admin', p_user using errcode = 'P0002';
    end if;
    if (select count(*) from public.super_admins s where s.revoked_at is null) <= 1 then
        raise exception 'The last super admin cannot be revoked'
            using errcode = '22023', hint = 'last_super_admin';
    end if;

    update public.super_admins
    set revoked_at = now(), revoked_by = v_actor
    where user_id = p_user and revoked_at is null;

    select coalesce(nullif(btrim(p.full_name), ''), u.email) into v_label
    from public.profiles p left join auth.users u on u.id::text = p.account_id
    where p.id = p_user;

    perform public.console_write_audit(
        'super_admin.revoke', 'user', p_user::text, null, jsonb_build_object('name', v_label));
end;
$$;


revoke execute on function public.console_list_super_admins() from public, anon;
revoke execute on function public.console_invite_super_admin(text, text) from public, anon;
revoke execute on function public.console_resend_super_admin_invitation(uuid) from public, anon;
revoke execute on function public.console_revoke_super_admin_invitation(uuid) from public, anon;
revoke execute on function public.console_accept_super_admin_invitation(text, text) from public, anon;
revoke execute on function public.console_revoke_super_admin(uuid) from public, anon;
revoke execute on function public.console_super_admin_invitation_by_token(text) from public;
grant execute on function public.console_list_super_admins() to authenticated;
grant execute on function public.console_invite_super_admin(text, text) to authenticated;
grant execute on function public.console_resend_super_admin_invitation(uuid) to authenticated;
grant execute on function public.console_revoke_super_admin_invitation(uuid) to authenticated;
grant execute on function public.console_accept_super_admin_invitation(text, text) to authenticated;
grant execute on function public.console_revoke_super_admin(uuid) to authenticated;
grant execute on function public.console_super_admin_invitation_by_token(text) to anon, authenticated;

commit;
