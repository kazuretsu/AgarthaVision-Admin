-- admin/0007 · Assigning a laboratory's patients to its medtechs
--
-- Run via: Supabase dashboard → SQL Editor → paste → Run. By hand, once.
-- Requires: admin/0001, admin/0002 (console_admin_owns_patient), the app's 0001 (patient_users),
-- 0007 (shared history) and 0014 (is_admin()).
--
-- ── The rule (D12, Feature Specs §1) ─────────────────────────────────────────
-- A medtech sees a patient in the app only through a `patient_users` link. The app's
-- `on_patient_created` trigger links the creator; nothing else could change links before this,
-- because `patient_users` has no write policy for anyone. Here an ORG ADMIN links and unlinks
-- their own laboratory's patients and ACTIVE MEDTECHS, through functions that check the caller
-- and write the audit row. A super admin may read the links (names of medtechs, never of
-- patients) but does not assign: who works on a clinic's patient is the clinic's decision.
--
-- A patient is never left with nobody: removing a link is refused when no other active medtech
-- of the laboratory would remain linked. `console_replace_assignment` swaps one medtech for
-- another in one transaction for that case.
--
-- ── What removing does ───────────────────────────────────────────────────────
-- It deletes the one `patient_users` row — the access link, which is what an assignment is.
-- The patient, every session, sample and report, and their authors (`user_id`) are untouched
-- (C8). Audit entries name the patient by record id only: super admins read the audit trail and
-- must not learn a patient's name (constraint #14).
--
-- Additive only: functions, no tables, no policy changes; nothing the app owns is altered.

begin;


-- ── Reads ────────────────────────────────────────────────────────────────────

-- Who is linked to one patient. The caller must be the org admin of the patient's laboratory,
-- or a super admin. `role` and `status` are the person's membership in the patient's
-- laboratory, null when they belong to none (a link from before organizations existed).
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
    if not (public.is_admin(auth.uid()) or public.console_admin_owns_patient(p_patient)) then
        raise exception 'Not permitted to read this patient''s assignments' using errcode = '42501';
    end if;

    return query
    select pu.user_id, p.full_name, m.role, m.status, pu.linked_at
    from public.patient_users pu
    join public.profiles p on p.id = pu.user_id
    left join public.patient_organizations po on po.patient_id = pu.patient_id
    left join public.organization_members m
           on m.user_id = pu.user_id and m.organization_id = po.organization_id
    where pu.patient_id = p_patient;
end;
$$;

-- The laboratory's patients one member is linked to. The patient's names come back only for
-- an org admin: a super admin reads patients de-identified (constraint #14).
create or replace function public.console_member_patients(p_user uuid)
returns table (
    patient_id         uuid,
    lastname           text,
    firstname          text,
    middle_name        text,
    psgc_barangay_code text,
    linked_at          timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
    v_org      uuid;
    v_super    boolean := public.is_admin(auth.uid());
begin
    select m.organization_id into v_org from public.organization_members m where m.user_id = p_user;
    if v_org is null then
        raise exception 'Member % does not exist', p_user using errcode = 'P0002';
    end if;
    if not (v_super or coalesce(public.console_org_admin_org(auth.uid()) = v_org, false)) then
        raise exception 'Not permitted to read this member''s patients' using errcode = '42501';
    end if;

    return query
    select pt.id,
           case when v_super then null else pt.lastname end,
           case when v_super then null else pt.firstname end,
           case when v_super then null else pt.middle_name end,
           pt.psgc_barangay_code,
           pu.linked_at
    from public.patient_users pu
    join public.patients pt on pt.id = pu.patient_id
    join public.patient_organizations po on po.patient_id = pt.id and po.organization_id = v_org
    where pu.user_id = p_user;
end;
$$;


-- ── Writes (org admins of the patient's laboratory) ──────────────────────────

-- The checks every write shares: an org admin, of the patient's laboratory.
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
    if not public.console_admin_owns_patient(p_patient) then
        raise exception 'This patient belongs to another laboratory' using errcode = '42501';
    end if;
    return v_org;
end;
$$;

-- A member's name for the audit line, as console_write_audit labels actors.
create or replace function public.console_person_label(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(nullif(btrim(p.full_name), ''), u.email)
    from public.profiles p left join auth.users u on u.id::text = p.account_id
    where p.id = p_user;
$$;

revoke execute on function public.console_require_patient_admin(uuid) from public, anon, authenticated;
revoke execute on function public.console_person_label(uuid) from public, anon, authenticated;

create or replace function public.console_assign_patient(p_patient uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_org      uuid := public.console_require_patient_admin(p_patient);
    v_inserted integer;
begin
    if not exists (select 1 from public.organization_members m
                   where m.user_id = p_user and m.organization_id = v_org
                     and m.role = 'medtech' and m.status = 'active') then
        raise exception 'Only an active medtech of this laboratory can be assigned'
            using errcode = '42501', hint = 'not_assignable';
    end if;

    insert into public.patient_users (patient_id, user_id)
    values (p_patient, p_user)
    on conflict do nothing;
    get diagnostics v_inserted = row_count;

    if v_inserted > 0 then
        perform public.console_write_audit(
            'assignment.add', 'patient', p_patient::text, v_org,
            jsonb_build_object('medtech_id', p_user, 'medtech', public.console_person_label(p_user)));
    end if;
end;
$$;

create or replace function public.console_unassign_patient(p_patient uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_org uuid := public.console_require_patient_admin(p_patient);
begin
    -- One remover at a time per patient, so two removals cannot each leave the other's last.
    perform 1 from public.patient_users pu where pu.patient_id = p_patient for update;

    if not exists (select 1 from public.patient_users pu
                   where pu.patient_id = p_patient and pu.user_id = p_user) then
        raise exception 'Not assigned' using errcode = 'P0002';
    end if;
    if not exists (select 1 from public.patient_users pu
                   join public.organization_members m
                     on m.user_id = pu.user_id and m.organization_id = v_org
                   where pu.patient_id = p_patient and pu.user_id <> p_user
                     and m.role = 'medtech' and m.status = 'active') then
        raise exception 'A patient keeps at least one active medtech'
            using errcode = '23514', hint = 'last_assignment';
    end if;

    delete from public.patient_users pu where pu.patient_id = p_patient and pu.user_id = p_user;

    perform public.console_write_audit(
        'assignment.remove', 'patient', p_patient::text, v_org,
        jsonb_build_object('medtech_id', p_user, 'medtech', public.console_person_label(p_user)));
end;
$$;

-- Hand a patient from one medtech to another in one step: the way to change the last one.
create or replace function public.console_replace_assignment(p_patient uuid, p_from uuid, p_to uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_from = p_to then
        raise exception 'Choose a different medtech' using errcode = '22023', hint = 'same';
    end if;
    perform public.console_assign_patient(p_patient, p_to);
    perform public.console_unassign_patient(p_patient, p_from);
end;
$$;

revoke execute on function public.console_patient_assignments(uuid) from public, anon;
revoke execute on function public.console_member_patients(uuid) from public, anon;
revoke execute on function public.console_assign_patient(uuid, uuid) from public, anon;
revoke execute on function public.console_unassign_patient(uuid, uuid) from public, anon;
revoke execute on function public.console_replace_assignment(uuid, uuid, uuid) from public, anon;
grant execute on function public.console_patient_assignments(uuid) to authenticated;
grant execute on function public.console_member_patients(uuid) to authenticated;
grant execute on function public.console_assign_patient(uuid, uuid) to authenticated;
grant execute on function public.console_unassign_patient(uuid, uuid) to authenticated;
grant execute on function public.console_replace_assignment(uuid, uuid, uuid) to authenticated;

commit;
