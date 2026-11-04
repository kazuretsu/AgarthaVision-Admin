-- admin/0023 · Sharing a patient with another laboratory (referral)
--
-- Run via: Supabase dashboard → SQL Editor → paste → Run. By hand, once.
-- Requires: admin/0001, admin/0002, admin/0007, admin/0008, admin/0010.
--
-- ── The rule (14zcqntjntd, Feature Specs §1) ──────────────────────────────────
-- A patient belongs to one organization permanently (D11). Only the owning organization's
-- admin (or a super admin) can share the patient with another laboratory — for example when
-- the patient is referred elsewhere — with a stated reason.
--
-- The receiving organization's admin can then see the patient and assign their own active
-- medtechs to it.
--
-- The owning org admin can revoke the share with a stated reason; the receiving side loses
-- access immediately. Nothing is deleted: the share record and audit trail remain.
-- The patient's owner never changes.
--
-- What the receiving laboratory may see of past smears: default is the patient and their
-- own new work only. The receiving laboratory does not see the sending laboratory's smears.
--
-- Additive only: new table patient_shares, policies, and security-definer functions.

begin;

-- ── 1. The patient_shares table ──────────────────────────────────────────────

create table if not exists public.patient_shares (
    id                     uuid primary key default gen_random_uuid(),
    patient_id             uuid not null references public.patients(id) on delete cascade,
    source_organization_id uuid not null references public.organizations(id),
    target_organization_id uuid not null references public.organizations(id),
    shared_by              uuid not null references public.profiles(id),
    share_reason           text not null,
    shared_at              timestamptz not null default clock_timestamp(),
    revoked_by             uuid references public.profiles(id),
    revocation_reason      text,
    revoked_at             timestamptz,
    constraint patient_shares_diff_org check (source_organization_id <> target_organization_id),
    constraint patient_shares_reason_nonempty check (length(btrim(share_reason)) > 0),
    constraint patient_shares_revoke_reason_check check (
        (revoked_at is null and revocation_reason is null and revoked_by is null)
        or (revoked_at is not null and length(btrim(coalesce(revocation_reason, ''))) > 0 and revoked_by is not null)
    )
);

create unique index if not exists patient_shares_active_unique
    on public.patient_shares (patient_id, target_organization_id)
    where revoked_at is null;

create index if not exists patient_shares_patient_idx
    on public.patient_shares (patient_id);

create index if not exists patient_shares_target_org_active_idx
    on public.patient_shares (target_organization_id)
    where revoked_at is null;

create index if not exists patient_shares_source_org_idx
    on public.patient_shares (source_organization_id);

alter table public.patient_shares enable row level security;

revoke all on public.patient_shares from anon;
revoke insert, update, delete, truncate on public.patient_shares from authenticated;

create policy "patient_shares: console read access"
on public.patient_shares for select to authenticated
using (
    public.is_admin(auth.uid())
    or source_organization_id = public.console_org_admin_org(auth.uid())
    or target_organization_id = public.console_org_admin_org(auth.uid())
);


-- ── 2. Read helpers and RLS expansion ────────────────────────────────────────

-- Security-definer helper to check if the caller's organization has an active share for this patient.
create or replace function public.console_admin_has_shared_patient(p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.patient_shares ps
        where ps.patient_id = p_patient
          and ps.target_organization_id = public.console_org_admin_org(auth.uid())
          and ps.revoked_at is null
    );
$$;

revoke execute on function public.console_admin_has_shared_patient(uuid) from public, anon;
grant execute on function public.console_admin_has_shared_patient(uuid) to authenticated;

-- Permissive policies on patients and patient_users: Postgres ORs these with existing policies.
create policy "patients: org admin reads shared patients"
on public.patients for select to authenticated
using ( public.console_admin_has_shared_patient(id) );

create policy "patient_users: org admin reads shared patient assignments"
on public.patient_users for select to authenticated
using ( public.console_admin_has_shared_patient(patient_id) );

-- Receiving org admin reads their own members' clinical work on shared patients.
create policy "sessions: org admin reads their own members work"
on public.sessions for select to authenticated
using (
    exists (
        select 1 from public.organization_members m
        where m.user_id = sessions.user_id
          and m.organization_id = public.console_org_admin_org(auth.uid())
    )
);

create policy "samples: org admin reads their own members work"
on public.samples for select to authenticated
using (
    exists (
        select 1 from public.organization_members m
        where m.user_id = samples.user_id
          and m.organization_id = public.console_org_admin_org(auth.uid())
    )
);

create policy "detections: org admin reads their own members work"
on public.detections for select to authenticated
using (
    exists (
        select 1 from public.samples sa
        join public.organization_members m on m.user_id = sa.user_id
        where sa.id = detections.sample_id
          and m.organization_id = public.console_org_admin_org(auth.uid())
    )
);

create policy "predictions: org admin reads their own members work"
on public.predictions for select to authenticated
using (
    exists (
        select 1 from public.samples sa
        join public.organization_members m on m.user_id = sa.user_id
        where sa.id = predictions.sample_id
          and m.organization_id = public.console_org_admin_org(auth.uid())
    )
);

create policy "findings: org admin reads their own members work"
on public.sample_species_findings for select to authenticated
using (
    exists (
        select 1 from public.samples sa
        join public.organization_members m on m.user_id = sa.user_id
        where sa.id = sample_species_findings.sample_id
          and m.organization_id = public.console_org_admin_org(auth.uid())
    )
);

create policy "reports: org admin reads their own members work"
on public.reports for select to authenticated
using (
    exists (
        select 1 from public.organization_members m
        where m.user_id = reports.user_id
          and m.organization_id = public.console_org_admin_org(auth.uid())
    )
);


-- ── 3. Updating assignment checks for shared patients ───────────────────────

create or replace function public.console_require_patient_admin(p_patient uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_org uuid := public.console_org_admin_org(auth.uid());
begin
    if v_org is null then
        raise exception 'Only an organization admin assigns patients' using errcode = '42501';
    end if;
    if not exists (select 1 from public.patients where id = p_patient) then
        raise exception 'Patient % does not exist', p_patient using errcode = 'P0002';
    end if;
    if not (public.console_admin_owns_patient(p_patient) or public.console_admin_has_shared_patient(p_patient)) then
        raise exception 'This patient belongs to another laboratory' using errcode = '42501';
    end if;
    return v_org;
end;
$$;

revoke execute on function public.console_require_patient_admin(uuid) from public, anon, authenticated;

-- Updating console_patient_assignments so receiving org admins can read assignments and
-- membership details resolve for members of either laboratory.
create or replace function public.console_patient_assignments(p_patient uuid)
returns table (
    user_id   uuid,
    full_name text,
    role      text,
    status    text,
    linked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
    if not (public.is_admin(auth.uid()) or public.console_admin_owns_patient(p_patient) or public.console_admin_has_shared_patient(p_patient)) then
        raise exception 'Not permitted to read this patient''s assignments' using errcode = '42501';
    end if;

    return query
    select pu.user_id, p.full_name, m.role, m.status, pu.linked_at
    from public.patient_users pu
    join public.profiles p on p.id = pu.user_id
    left join public.organization_members m on m.user_id = pu.user_id
    where pu.patient_id = p_patient;
end;
$$;

revoke execute on function public.console_patient_assignments(uuid) from public, anon;
grant execute on function public.console_patient_assignments(uuid) to authenticated;

-- Updating console_unassign_patient so receiving org admins can unassign their members freely,
-- while the owning laboratory continues to enforce that at least one of its active members remains.
create or replace function public.console_unassign_patient(p_patient uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_org      uuid := public.console_require_patient_admin(p_patient);
    v_role     text;
    v_is_owner boolean := public.console_admin_owns_patient(p_patient);
begin
    perform 1 from public.patient_users pu where pu.patient_id = p_patient for update;

    if not exists (select 1 from public.patient_users pu
                   where pu.patient_id = p_patient and pu.user_id = p_user) then
        raise exception 'Not assigned' using errcode = 'P0002';
    end if;

    if v_is_owner and not exists (select 1 from public.patient_users pu
                   join public.organization_members m
                     on m.user_id = pu.user_id and m.organization_id = v_org
                   where pu.patient_id = p_patient and pu.user_id <> p_user
                     and m.status = 'active') then
        raise exception 'A patient keeps at least one active member of its laboratory'
            using errcode = '23514', hint = 'last_assignment';
    end if;

    select m.role into v_role
    from public.organization_members m
    where m.user_id = p_user and m.organization_id = v_org;

    delete from public.patient_users pu where pu.patient_id = p_patient and pu.user_id = p_user;

    perform public.console_write_audit(
        'assignment.remove', 'patient', p_patient::text, v_org,
        jsonb_build_object('member_id', p_user,
                           'member', public.console_person_label(p_user),
                           'role', v_role));
end;
$$;

revoke execute on function public.console_unassign_patient(uuid, uuid) from public, anon;
grant execute on function public.console_unassign_patient(uuid, uuid) to authenticated;


-- ── 4. Security-definer functions for sharing & revoking ────────────────────

create or replace function public.console_share_patient(
    p_patient    uuid,
    p_target_org uuid,
    p_reason     text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_source_org      uuid;
    v_target_org_name text;
    v_clean_reason    text := btrim(coalesce(p_reason, ''));
    v_share_id        uuid;
    v_actor_profile   uuid;
    v_is_super        boolean := public.is_admin(auth.uid());
begin
    -- 1. Authorization: Only owning org admin or super admin can share.
    if v_is_super then
        select po.organization_id into v_source_org
        from public.patient_organizations po
        where po.patient_id = p_patient;
    else
        v_source_org := public.console_org_admin_org(auth.uid());
        if not public.console_admin_owns_patient(p_patient) then
            raise exception 'Only the owning organization admin can share this patient'
                using errcode = '42501', hint = 'not_owning_admin';
        end if;
    end if;

    if v_source_org is null then
        raise exception 'Patient % does not have an owning organization', p_patient
            using errcode = 'P0002';
    end if;

    -- 2. Validate reason
    if length(v_clean_reason) = 0 then
        raise exception 'A stated reason is required to share a patient'
            using errcode = '23514', hint = 'reason_required';
    end if;

    -- 3. Validate target organization
    if v_source_org = p_target_org then
        raise exception 'Cannot share a patient with the owning organization'
            using errcode = '22023', hint = 'same_organization';
    end if;

    select name into v_target_org_name
    from public.organizations
    where id = p_target_org and status = 'active';

    if v_target_org_name is null then
        raise exception 'Target organization does not exist or is not active'
            using errcode = 'P0002', hint = 'target_org_inactive';
    end if;

    if exists (
        select 1 from public.patient_shares
        where patient_id = p_patient
          and target_organization_id = p_target_org
          and revoked_at is null
    ) then
        raise exception 'This patient is already shared with this organization'
            using errcode = '23505', hint = 'already_shared';
    end if;

    select id into v_actor_profile from public.profiles where account_id = auth.uid()::text limit 1;
    if v_actor_profile is null then
        v_actor_profile := auth.uid();
    end if;

    insert into public.patient_shares (
        patient_id,
        source_organization_id,
        target_organization_id,
        shared_by,
        share_reason
    ) values (
        p_patient,
        v_source_org,
        p_target_org,
        v_actor_profile,
        v_clean_reason
    )
    returning id into v_share_id;

    perform public.console_write_audit(
        'patient.share',
        'patient',
        p_patient::text,
        v_source_org,
        jsonb_build_object(
            'share_id', v_share_id,
            'target_organization_id', p_target_org,
            'target_organization_name', v_target_org_name,
            'reason', v_clean_reason
        )
    );

    return v_share_id;
end;
$$;

create or replace function public.console_revoke_patient_share(
    p_share_id uuid,
    p_reason   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_clean_reason   text := btrim(coalesce(p_reason, ''));
    v_share          record;
    v_actor_profile  uuid;
    v_is_super       boolean := public.is_admin(auth.uid());
    v_caller_org     uuid := public.console_org_admin_org(auth.uid());
begin
    if length(v_clean_reason) = 0 then
        raise exception 'A stated reason is required to revoke a patient share'
            using errcode = '23514', hint = 'reason_required';
    end if;

    select ps.*, o.name as target_organization_name
    into v_share
    from public.patient_shares ps
    join public.organizations o on o.id = ps.target_organization_id
    where ps.id = p_share_id;

    if v_share.id is null then
        raise exception 'Patient share % does not exist', p_share_id using errcode = 'P0002';
    end if;

    if v_share.revoked_at is not null then
        raise exception 'This patient share is already revoked'
            using errcode = '22023', hint = 'already_revoked';
    end if;

    if not (v_is_super or (v_caller_org is not null and v_caller_org = v_share.source_organization_id)) then
        raise exception 'Only the owning organization admin can revoke this share'
            using errcode = '42501', hint = 'not_owning_admin';
    end if;

    select id into v_actor_profile from public.profiles where account_id = auth.uid()::text limit 1;
    if v_actor_profile is null then
        v_actor_profile := auth.uid();
    end if;

    update public.patient_shares
    set revoked_at = clock_timestamp(),
        revoked_by = v_actor_profile,
        revocation_reason = v_clean_reason
    where id = p_share_id;

    perform public.console_write_audit(
        'patient.share_revoke',
        'patient',
        v_share.patient_id::text,
        v_share.source_organization_id,
        jsonb_build_object(
            'share_id', p_share_id,
            'target_organization_id', v_share.target_organization_id,
            'target_organization_name', v_share.target_organization_name,
            'reason', v_clean_reason
        )
    );
end;
$$;

create or replace function public.console_patient_shares(p_patient uuid)
returns table (
    id                       uuid,
    patient_id               uuid,
    source_organization_id   uuid,
    source_organization_name text,
    target_organization_id   uuid,
    target_organization_name text,
    shared_by_name           text,
    share_reason             text,
    shared_at                timestamptz,
    revoked_by_name          text,
    revocation_reason        text,
    revoked_at               timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
    v_caller_org uuid := public.console_org_admin_org(auth.uid());
    v_is_super   boolean := public.is_admin(auth.uid());
begin
    if not (v_is_super or public.console_admin_owns_patient(p_patient) or public.console_admin_has_shared_patient(p_patient)) then
        raise exception 'Not permitted to read shares for this patient' using errcode = '42501';
    end if;

    return query
    select ps.id,
           ps.patient_id,
           ps.source_organization_id,
           s_org.name,
           ps.target_organization_id,
           t_org.name,
           sp.full_name,
           ps.share_reason,
           ps.shared_at,
           rp.full_name,
           ps.revocation_reason,
           ps.revoked_at
    from public.patient_shares ps
    join public.organizations s_org on s_org.id = ps.source_organization_id
    join public.organizations t_org on t_org.id = ps.target_organization_id
    left join public.profiles sp on sp.id = ps.shared_by
    left join public.profiles rp on rp.id = ps.revoked_by
    where ps.patient_id = p_patient
      and (
        v_is_super
        or ps.source_organization_id = v_caller_org
        or (ps.target_organization_id = v_caller_org and (ps.revoked_at is null or ps.target_organization_id = v_caller_org))
      )
    order by ps.shared_at desc;
end;
$$;

revoke execute on function public.console_share_patient(uuid, uuid, text) from public, anon;
revoke execute on function public.console_revoke_patient_share(uuid, text) from public, anon;
revoke execute on function public.console_patient_shares(uuid) from public, anon;
grant execute on function public.console_share_patient(uuid, uuid, text) to authenticated;
grant execute on function public.console_revoke_patient_share(uuid, text) to authenticated;
grant execute on function public.console_patient_shares(uuid) to authenticated;

commit;

