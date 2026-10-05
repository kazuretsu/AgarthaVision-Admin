-- admin/0005 · Invitations: the only way anyone gets an account
--
-- Run via: Supabase dashboard → SQL Editor → paste → Run. By hand, once.
-- Requires: admin/0001_organizations.sql; the app's 0014_super_admins.sql (is_admin()).
--
-- ── The rule (Feature Specs §1) ──────────────────────────────────────────────
--   * A super admin invites an ORG ADMIN into an organization they choose.
--   * An org admin invites a MEDTECH into their OWN organization, and nothing else.
-- The role and the organization are decided here, from who is inviting, and stored on the
-- invitation. The invitee never supplies either: accepting reads them from this row, never
-- from anything the invitee can edit (Supabase `user_metadata` included).
--
-- ── The link ─────────────────────────────────────────────────────────────────
-- Each invitation carries a random token, returned once to the inviting console so it can be
-- emailed, and stored only as its SHA-256. A re-send mints a new token and a new expiry, so an
-- older email stops working. "Expired" is not stored: it is a pending invitation past
-- `expires_at`.
--
-- ── Nothing is deleted (C8) ──────────────────────────────────────────────────
-- An invitation is revoked, never deleted. No table policy allows a write: every change is a
-- security-definer function below that checks the caller and writes the audit row in the
-- same transaction. Additive only: nothing the app owns is altered or dropped. Accepting
-- fills the new profile's `full_name` (a value, not a schema change), which the app's
-- `handle_new_user()` leaves empty.

begin;


-- ── organization_invitations ─────────────────────────────────────────────────
create table public.organization_invitations (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id),
    -- Stored as it will be compared: trimmed and lower-case.
    email           text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    full_name       text check (full_name is null or length(full_name) between 1 and 120),
    role            text not null check (role in ('org_admin', 'medtech')),
    token_hash      text not null unique,
    status          text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
    expires_at      timestamptz not null,
    invited_by      uuid references public.profiles(id) on delete set null,
    invited_at      timestamptz not null default now(),
    sent_count      integer not null default 1,
    last_sent_at    timestamptz not null default now(),
    accepted_by     uuid references public.profiles(id) on delete set null,
    accepted_at     timestamptz,
    revoked_by      uuid references public.profiles(id) on delete set null,
    revoked_at      timestamptz
);

create index organization_invitations_org_idx on public.organization_invitations (organization_id, invited_at desc);
create index organization_invitations_email_idx on public.organization_invitations (email);


-- ── Helpers ──────────────────────────────────────────────────────────────────

-- How long a link works, from the moment it is sent.
create or replace function public.console_invitation_ttl()
returns interval
language sql
immutable
as $$ select interval '7 days' $$;

-- A fresh link token: two v4 UUIDs, 244 random bits, as 64 hex characters.
create or replace function public.console_new_invitation_token()
returns text
language sql
volatile
as $$ select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') $$;

create or replace function public.console_invitation_token_hash(p_token text)
returns text
language sql
immutable
as $$ select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') $$;

-- Whether a user may re-send or revoke this invitation: a super admin, any; an org admin,
-- only a medtech invitation into their own organization.
create or replace function public.console_can_manage_invitation(p_user uuid, p_invitation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.is_admin(p_user)
        or exists (
            select 1 from public.organization_invitations i
            where i.id = p_invitation
              and i.role = 'medtech'
              and i.organization_id = public.console_org_admin_org(p_user)
        );
$$;

-- Whether an email belongs to someone who may not be invited: an account that is already in
-- an organization, or a super admin. An account in none — a login whose acceptance failed
-- half way, say — can be invited; accepting then signs in to it, and no second account is made.
create or replace function public.console_email_taken(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from auth.users u
        where lower(u.email) = lower(btrim(p_email))
          and (public.is_admin(u.id)
               or exists (select 1 from public.organization_members m
                          left join public.profiles p on p.id = m.user_id
                          where m.user_id = u.id or p.account_id = u.id::text))
    );
$$;

-- The shortest wait between two emails for one invitation.
create or replace function public.console_resend_interval()
returns interval
language sql
immutable
as $$ select interval '1 minute' $$;

revoke execute on function public.console_email_taken(text) from public, anon, authenticated;
revoke execute on function public.console_new_invitation_token() from public, anon, authenticated;
revoke execute on function public.console_can_manage_invitation(uuid, uuid) from public, anon, authenticated;


-- ── Row Level Security ───────────────────────────────────────────────────────
-- Reads only, and never the token hash. Writes go through the functions below.
alter table public.organization_invitations enable row level security;

revoke all on public.organization_invitations from anon, authenticated;
grant select (id, organization_id, email, full_name, role, status, expires_at, invited_by,
              invited_at, sent_count, last_sent_at, accepted_by, accepted_at, revoked_by,
              revoked_at)
    on public.organization_invitations to authenticated;

create policy "organization_invitations: super admin reads all"
on public.organization_invitations for select to authenticated
using ( public.is_admin(auth.uid()) );

create policy "organization_invitations: org admin reads their organization"
on public.organization_invitations for select to authenticated
using ( organization_id = public.console_org_admin_org(auth.uid()) );


-- ── Invite ───────────────────────────────────────────────────────────────────
-- Returns the token once, for the console to email. Refuses an email whose account is
-- already in an organization or is a super admin (`console_email_taken`), and one with a live
-- invitation already (re-send that one instead). Errors carry a HINT naming which it was.
create or replace function public.console_invite(
    p_email           text,
    p_full_name       text,
    p_organization_id uuid
)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
    v_actor     uuid := auth.uid();
    v_admin_org uuid := public.console_org_admin_org(v_actor);
    v_email     text := lower(btrim(coalesce(p_email, '')));
    v_name      text := nullif(regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g'), '');
    v_role      text;
    v_token     text := public.console_new_invitation_token();
    v_id        uuid;
    v_expires   timestamptz := now() + public.console_invitation_ttl();
begin
    if public.is_admin(v_actor) then
        v_role := 'org_admin';
    elsif v_admin_org is not null then
        if p_organization_id is distinct from v_admin_org then
            raise exception 'An organization admin invites only into their own organization'
                using errcode = '42501';
        end if;
        v_role := 'medtech';
    else
        raise exception 'Only a super admin or an organization admin can invite'
            using errcode = '42501';
    end if;

    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'Not an email address' using errcode = '22023', hint = 'email';
    end if;
    if v_name is not null and length(v_name) > 120 then
        raise exception 'Name too long' using errcode = '22023', hint = 'name';
    end if;
    if not exists (select 1 from public.organizations o
                   where o.id = p_organization_id and o.status = 'active') then
        raise exception 'Organization % is not active', p_organization_id
            using errcode = 'P0002';
    end if;

    -- Two inviters typing the same address at once must not both succeed.
    perform pg_advisory_xact_lock(hashtext('console_invite:' || v_email));

    if public.console_email_taken(v_email) then
        raise exception 'This email already has an account' using errcode = '23505', hint = 'account_exists';
    end if;
    if exists (select 1 from public.organization_invitations i
               where i.email = v_email and i.status = 'pending' and i.expires_at > now()) then
        raise exception 'This email already has a pending invitation'
            using errcode = '23505', hint = 'invitation_pending';
    end if;

    insert into public.organization_invitations
        (organization_id, email, full_name, role, token_hash, expires_at, invited_by)
    values
        (p_organization_id, v_email, v_name, v_role,
         public.console_invitation_token_hash(v_token), v_expires, v_actor)
    returning id into v_id;

    perform public.console_write_audit(
        'invitation.create', 'invitation', v_id::text, p_organization_id,
        jsonb_build_object('email', v_email, 'role', v_role, 'name', v_name));

    return query select v_id, v_token, v_expires;
end;
$$;


-- ── Re-send ──────────────────────────────────────────────────────────────────
-- A new token and a new expiry; the previous link stops working. Works on an expired
-- invitation too — that is what re-sending is for. At most one email a minute per
-- invitation, so repeated clicks cannot flood an inbox.
create or replace function public.console_resend_invitation(p_id uuid)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
    v_actor   uuid := auth.uid();
    v_inv     public.organization_invitations;
    v_token   text := public.console_new_invitation_token();
    v_expires timestamptz := now() + public.console_invitation_ttl();
begin
    select * into v_inv from public.organization_invitations i where i.id = p_id for update;
    if not found then
        raise exception 'Invitation % does not exist', p_id using errcode = 'P0002';
    end if;
    if not public.console_can_manage_invitation(v_actor, p_id) then
        raise exception 'Not permitted to re-send this invitation' using errcode = '42501';
    end if;
    if v_inv.status <> 'pending' then
        raise exception 'Invitation is %', v_inv.status using errcode = '22023', hint = v_inv.status;
    end if;
    if not exists (select 1 from public.organizations o
                   where o.id = v_inv.organization_id and o.status = 'active') then
        raise exception 'Organization is not active' using errcode = 'P0002';
    end if;
    if public.console_email_taken(v_inv.email) then
        raise exception 'This email already has an account' using errcode = '23505', hint = 'account_exists';
    end if;
    if v_inv.last_sent_at > now() - public.console_resend_interval() then
        raise exception 'Sent less than a minute ago' using errcode = '22023', hint = 'too_soon';
    end if;

    update public.organization_invitations i
    set token_hash   = public.console_invitation_token_hash(v_token),
        expires_at   = v_expires,
        sent_count   = i.sent_count + 1,
        last_sent_at = now()
    where i.id = p_id;

    perform public.console_write_audit(
        'invitation.resend', 'invitation', p_id::text, v_inv.organization_id,
        jsonb_build_object('email', v_inv.email, 'role', v_inv.role));

    return query select v_token, v_expires;
end;
$$;


-- ── Revoke ───────────────────────────────────────────────────────────────────
create or replace function public.console_revoke_invitation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor uuid := auth.uid();
    v_inv   public.organization_invitations;
begin
    select * into v_inv from public.organization_invitations i where i.id = p_id for update;
    if not found then
        raise exception 'Invitation % does not exist', p_id using errcode = 'P0002';
    end if;
    if not public.console_can_manage_invitation(v_actor, p_id) then
        raise exception 'Not permitted to revoke this invitation' using errcode = '42501';
    end if;
    if v_inv.status <> 'pending' then
        raise exception 'Invitation is %', v_inv.status using errcode = '22023', hint = v_inv.status;
    end if;

    update public.organization_invitations
    set status = 'revoked', revoked_by = v_actor, revoked_at = now()
    where id = p_id;

    perform public.console_write_audit(
        'invitation.revoke', 'invitation', p_id::text, v_inv.organization_id,
        jsonb_build_object('email', v_inv.email, 'role', v_inv.role));
end;
$$;


-- ── Look up a link ───────────────────────────────────────────────────────────
-- What the accept page shows before anyone has an account, so it is open to `anon`. Holding
-- the token is the permission: it reveals only the invitation that token belongs to. No row
-- means no such link.
create or replace function public.console_invitation_by_token(p_token text)
returns table (
    email             text,
    full_name         text,
    role              text,
    organization_name text,
    state             text,
    expires_at        timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
    select i.email, i.full_name, i.role, o.name,
           case
               when i.status <> 'pending' then i.status
               when o.status <> 'active' then 'unavailable'
               when i.expires_at <= now() then 'expired'
               else 'pending'
           end,
           i.expires_at
    from public.organization_invitations i
    join public.organizations o on o.id = i.organization_id
    where i.token_hash = public.console_invitation_token_hash(p_token);
$$;


-- ── Accept ───────────────────────────────────────────────────────────────────
-- Run as the invitee, signed in with the account made for this email. The membership's role
-- and organization come from the invitation row and nothing else.
create or replace function public.console_accept_invitation(p_token text, p_full_name text)
returns table (organization_id uuid, role text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
    v_actor uuid := auth.uid();
    v_inv   public.organization_invitations;
    v_email text;
    v_name  text := nullif(regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g'), '');
begin
    if v_actor is null then
        raise exception 'Sign in to accept an invitation' using errcode = '42501';
    end if;

    select * into v_inv from public.organization_invitations i
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
    if not exists (select 1 from public.organizations o
                   where o.id = v_inv.organization_id and o.status = 'active') then
        raise exception 'Organization is not active' using errcode = '22023', hint = 'unavailable';
    end if;

    select lower(u.email) into v_email from auth.users u where u.id = v_actor;
    if v_email is distinct from v_inv.email then
        raise exception 'This invitation is for another email address' using errcode = '42501';
    end if;
    if exists (select 1 from public.organization_members m where m.user_id = v_actor) then
        raise exception 'Already a member of an organization' using errcode = '23505', hint = 'already_member';
    end if;
    if v_name is not null and length(v_name) > 120 then
        raise exception 'Name too long' using errcode = '22023', hint = 'name';
    end if;

    insert into public.organization_members (user_id, organization_id, role, added_by)
    values (v_actor, v_inv.organization_id, v_inv.role, v_inv.invited_by);

    update public.profiles
    set full_name = coalesce(v_name, v_inv.full_name, full_name)
    where id = v_actor;

    update public.organization_invitations
    set status = 'accepted', accepted_by = v_actor, accepted_at = now()
    where id = v_inv.id;

    perform public.console_write_audit(
        'invitation.accept', 'invitation', v_inv.id::text, v_inv.organization_id,
        jsonb_build_object('email', v_inv.email, 'role', v_inv.role));

    return query select v_inv.organization_id, v_inv.role;
end;
$$;

revoke execute on function public.console_invite(text, text, uuid) from public, anon;
revoke execute on function public.console_resend_invitation(uuid) from public, anon;
revoke execute on function public.console_revoke_invitation(uuid) from public, anon;
revoke execute on function public.console_accept_invitation(text, text) from public, anon;
revoke execute on function public.console_invitation_by_token(text) from public;
grant execute on function public.console_invite(text, text, uuid) to authenticated;
grant execute on function public.console_resend_invitation(uuid) to authenticated;
grant execute on function public.console_revoke_invitation(uuid) to authenticated;
grant execute on function public.console_accept_invitation(text, text) to authenticated;
grant execute on function public.console_invitation_by_token(text) to anon, authenticated;

commit;
