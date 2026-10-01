-- admin/0001 · Laboratory organizations, memberships, patient ownership and the audit log
--
-- Run via: Supabase dashboard → SQL Editor → paste → Run. By hand, once (the app repo's C6).
-- Requires: the app repo's supabase/migrations/0001_init.sql through 0006 on `development`.
--
-- ── Why this lives in the admin repo ─────────────────────────────────────────
-- Admin migrations have their own sequence under supabase/migrations/admin/ so two repos
-- never mint the same number against one database (Decisions & Risks, "Migration
-- convention"). They are ADDITIVE ONLY: new tables, functions, triggers and permissive
-- policies. Nothing here alters or drops an object the Android app owns, so the app keeps
-- syncing exactly as before and after this runs.
--
-- ── The model (Feature Specs §1) ─────────────────────────────────────────────
--   * A laboratory is an organization. Only a super admin (profiles.role = 'admin') creates,
--     renames or deactivates one.
--   * A user belongs to at most ONE organization (D10): organization_members is keyed by
--     user_id. "Org admin" is a role on the membership, never on the profile, so it cannot
--     outlive the membership.
--   * The organization owns the patient (D11): patient_organizations is keyed by patient_id.
--     Filling it for new patients is admin/0002's job.
--   * Every console write is recorded in admin_audit_log, in the same transaction as the
--     write, by the function that performs it.
--
-- The shapes mirror Better Auth's organization plugin (organization, member) so a later
-- provider move maps cleanly. Tables reference profiles(id), not auth.users, to stay
-- provider-agnostic.
--
-- ── Nothing is deleted (C8) ──────────────────────────────────────────────────
-- Organizations and memberships are deactivated, never deleted: no DELETE policy exists and
-- no function deletes. The audit log refuses UPDATE and DELETE for every role.

begin;


-- ── organizations ────────────────────────────────────────────────────────────
create table public.organizations (
    id             uuid primary key default gen_random_uuid(),
    name           text not null check (length(btrim(name)) between 2 and 120),
    status         text not null default 'active' check (status in ('active', 'deactivated')),
    -- Null only for the starting organization this migration creates.
    created_by     uuid references public.profiles(id) on delete set null,
    created_at     timestamptz not null default now(),
    deactivated_at timestamptz
);

-- Two laboratories with the same name are one typo away from a patient filed in the wrong
-- one. Case and surrounding space do not make a name different.
create unique index organizations_name_unique on public.organizations (lower(btrim(name)));


-- ── organization_members ─────────────────────────────────────────────────────
create table public.organization_members (
    -- The primary key is the "one organization per user" rule (D10).
    user_id         uuid primary key references public.profiles(id) on delete cascade,
    organization_id uuid not null references public.organizations(id),
    role            text not null check (role in ('org_admin', 'medtech')),
    status          text not null default 'active' check (status in ('active', 'deactivated')),
    added_by        uuid references public.profiles(id) on delete set null,
    added_at        timestamptz not null default now()
);

create index organization_members_org_idx on public.organization_members (organization_id, role);


-- ── patient_organizations ────────────────────────────────────────────────────
-- The scoping key: which laboratory owns a patient. Set once, never changed (D11).
create table public.patient_organizations (
    patient_id      uuid primary key references public.patients(id) on delete cascade,
    organization_id uuid not null references public.organizations(id),
    assigned_at     timestamptz not null default now()
);

create index patient_organizations_org_idx on public.patient_organizations (organization_id);


-- ── admin_audit_log ──────────────────────────────────────────────────────────
-- Who did what, to whom, and when. Append-only: written only by the security-definer
-- functions below, never by a client, and never changed afterwards.
create table public.admin_audit_log (
    id              bigint generated always as identity primary key,
    at              timestamptz not null default now(),
    -- Set null if the actor's profile is ever removed; actor_label keeps who it was.
    actor_id        uuid references public.profiles(id) on delete set null,
    actor_label     text,
    action          text not null check (length(btrim(action)) > 0),
    target_type     text not null,
    target_id       text,
    -- The organization the action happened in, for org-admin scoping. Null for actions
    -- above any one organization.
    organization_id uuid references public.organizations(id),
    details         jsonb not null default '{}'::jsonb
);

create index admin_audit_log_at_idx  on public.admin_audit_log (at desc);
create index admin_audit_log_org_idx on public.admin_audit_log (organization_id, at desc);

-- A second line behind the missing policies: even a role that bypasses RLS cannot rewrite
-- history through a normal statement.
--
-- One update is allowed: the foreign key's own `on delete set null` when an actor's profile
-- is removed. Refusing it would make deleting a user fail — a change to how an app-owned
-- table behaves, which an additive migration must not make. actor_label keeps who it was.
create or replace function public.console_audit_log_is_append_only()
returns trigger
language plpgsql
as $$
begin
    if tg_op = 'UPDATE'
       and old.actor_id is not null and new.actor_id is null
       and (new.id, new.at, new.actor_label, new.action, new.target_type,
            new.target_id, new.organization_id, new.details)
           is not distinct from
           (old.id, old.at, old.actor_label, old.action, old.target_type,
            old.target_id, old.organization_id, old.details)
    then
        return new;
    end if;
    raise exception 'admin_audit_log is append-only';
end;
$$;

create trigger admin_audit_log_append_only
before update or delete on public.admin_audit_log
for each row execute function public.console_audit_log_is_append_only();

create trigger admin_audit_log_no_truncate
before truncate on public.admin_audit_log
for each statement execute function public.console_audit_log_is_append_only();


-- ── Helpers ──────────────────────────────────────────────────────────────────
-- Security definer so a policy on organization_members can ask about organization_members
-- without recursing into itself — the same reason the app's is_admin() exists.

-- The organization a user administers: an active org-admin membership in an active
-- organization. Null for everyone else, including super admins.
create or replace function public.console_org_admin_org(p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select m.organization_id
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = p_user
      and m.role = 'org_admin'
      and m.status = 'active'
      and o.status = 'active';
$$;

-- The organization a user belongs to, in any role, while both are active.
create or replace function public.console_member_org(p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select m.organization_id
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = p_user
      and m.status = 'active'
      and o.status = 'active';
$$;

revoke execute on function public.console_org_admin_org(uuid) from public, anon;
revoke execute on function public.console_member_org(uuid) from public, anon;
grant execute on function public.console_org_admin_org(uuid) to authenticated;
grant execute on function public.console_member_org(uuid) to authenticated;

-- Writes one audit row as the calling user. Internal: only other security-definer
-- functions call it, so no client can forge an entry.
create or replace function public.console_write_audit(
    p_action          text,
    p_target_type     text,
    p_target_id       text,
    p_organization_id uuid,
    p_details         jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor uuid := auth.uid();
begin
    insert into public.admin_audit_log
        (actor_id, actor_label, action, target_type, target_id, organization_id, details)
    values (
        v_actor,
        (select coalesce(nullif(btrim(p.full_name), ''), u.email)
           from public.profiles p left join auth.users u on u.id = p.id
          where p.id = v_actor),
        p_action, p_target_type, p_target_id, p_organization_id, coalesce(p_details, '{}'::jsonb)
    );
end;
$$;

revoke execute on function public.console_write_audit(text, text, text, uuid, jsonb) from public, anon, authenticated;


-- ── Row Level Security ───────────────────────────────────────────────────────
-- Reads only. There are no INSERT, UPDATE or DELETE policies on any of these tables: every
-- write goes through a function below, which checks the caller and writes the audit row.
alter table public.organizations          enable row level security;
alter table public.organization_members   enable row level security;
alter table public.patient_organizations  enable row level security;
alter table public.admin_audit_log        enable row level security;

revoke all on public.organizations, public.organization_members,
              public.patient_organizations, public.admin_audit_log from anon;
revoke insert, update, delete, truncate on public.organizations, public.organization_members,
              public.patient_organizations, public.admin_audit_log from authenticated;

create policy "organizations: super admin reads all"
on public.organizations for select to authenticated
using ( public.is_admin(auth.uid()) );

-- Members see their own laboratory's name (the console header, later the app).
create policy "organizations: members read their own"
on public.organizations for select to authenticated
using ( id = public.console_member_org(auth.uid()) );

create policy "organization_members: super admin reads all"
on public.organization_members for select to authenticated
using ( public.is_admin(auth.uid()) );

create policy "organization_members: org admin reads their organization"
on public.organization_members for select to authenticated
using ( organization_id = public.console_org_admin_org(auth.uid()) );

-- A user always sees their own membership, active or not, so the console can tell a
-- deactivated org admin why they were turned away.
create policy "organization_members: users read their own"
on public.organization_members for select to authenticated
using ( user_id = auth.uid() );

create policy "patient_organizations: super admin reads all"
on public.patient_organizations for select to authenticated
using ( public.is_admin(auth.uid()) );

create policy "patient_organizations: org admin reads their organization"
on public.patient_organizations for select to authenticated
using ( organization_id = public.console_org_admin_org(auth.uid()) );

create policy "admin_audit_log: super admin reads all"
on public.admin_audit_log for select to authenticated
using ( public.is_admin(auth.uid()) );

create policy "admin_audit_log: org admin reads their organization"
on public.admin_audit_log for select to authenticated
using ( organization_id = public.console_org_admin_org(auth.uid()) );


-- ── Organization writes (super admin only) ───────────────────────────────────
-- The console checks the same rule in its own code first (D7); this is the second line.

create or replace function public.console_create_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
    v_id   uuid;
begin
    if not public.is_admin(auth.uid()) then
        raise exception 'Only a super admin can create an organization' using errcode = '42501';
    end if;

    insert into public.organizations (name, created_by)
    values (v_name, auth.uid())
    returning id into v_id;

    perform public.console_write_audit(
        'organization.create', 'organization', v_id::text, v_id, jsonb_build_object('name', v_name));
    return v_id;
end;
$$;

create or replace function public.console_rename_organization(p_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
    v_old  text;
begin
    if not public.is_admin(auth.uid()) then
        raise exception 'Only a super admin can rename an organization' using errcode = '42501';
    end if;

    select name into v_old from public.organizations where id = p_id for update;
    if not found then
        raise exception 'Organization % does not exist', p_id using errcode = 'P0002';
    end if;
    if v_old = v_name then
        return;
    end if;

    update public.organizations set name = v_name where id = p_id;

    perform public.console_write_audit(
        'organization.rename', 'organization', p_id::text, p_id,
        jsonb_build_object('from', v_old, 'to', v_name));
end;
$$;

-- Deactivation hides nothing and deletes nothing: the organization, its members, its
-- patients and every record under them stay. Its org admins simply lose console access
-- until it is reactivated.
create or replace function public.console_set_organization_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_old text;
begin
    if not public.is_admin(auth.uid()) then
        raise exception 'Only a super admin can change an organization''s status' using errcode = '42501';
    end if;
    if p_status not in ('active', 'deactivated') then
        raise exception 'Unknown organization status %', p_status using errcode = '22023';
    end if;

    select status into v_old from public.organizations where id = p_id for update;
    if not found then
        raise exception 'Organization % does not exist', p_id using errcode = 'P0002';
    end if;
    if v_old = p_status then
        return;
    end if;

    update public.organizations
    set status = p_status,
        deactivated_at = case when p_status = 'deactivated' then now() end
    where id = p_id;

    perform public.console_write_audit(
        case when p_status = 'deactivated' then 'organization.deactivate'
             else 'organization.reactivate' end,
        'organization', p_id::text, p_id, '{}'::jsonb);
end;
$$;

revoke execute on function public.console_create_organization(text) from public, anon;
revoke execute on function public.console_rename_organization(uuid, text) from public, anon;
revoke execute on function public.console_set_organization_status(uuid, text) from public, anon;
grant execute on function public.console_create_organization(text) to authenticated;
grant execute on function public.console_rename_organization(uuid, text) to authenticated;
grant execute on function public.console_set_organization_status(uuid, text) to authenticated;


-- ── Backfill: a home for everything that already exists ──────────────────────
-- One starting organization holds every existing medtech and every existing patient, so
-- nothing becomes invisible or orphaned when scoping arrives (admin/0002). Super admins are
-- not members of any organization; they see all of them. Rename it in the console.
with starting as (
    insert into public.organizations (name)
    values ('Starting laboratory')
    returning id
),
members as (
    insert into public.organization_members (user_id, organization_id, role)
    select p.id, starting.id, 'medtech'
    from public.profiles p, starting
    where p.role <> 'admin'
    returning 1
),
patients as (
    insert into public.patient_organizations (patient_id, organization_id)
    select pt.id, starting.id
    from public.patients pt, starting
    returning 1
)
insert into public.admin_audit_log (action, target_type, target_id, organization_id, details)
select 'organization.backfill', 'organization', starting.id::text, starting.id,
       jsonb_build_object(
           'members', (select count(*) from members),
           'patients', (select count(*) from patients),
           'migration', 'admin/0001_organizations.sql')
from starting;

commit;
