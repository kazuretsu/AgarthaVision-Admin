-- admin/0008 · Org admins do fieldwork: any active member of a laboratory can be assigned
--
-- Run via: Supabase dashboard → SQL Editor → paste → Run. By hand, once.
-- Requires: admin/0007_patient_assignments.sql (the functions this replaces, and
-- console_require_patient_admin / console_person_label, which it reuses unchanged).
--
-- ── The rule (14zcqntkd0w) ───────────────────────────────────────────────────
-- A membership's role is a permission level, not a job. An org admin can do everything a
-- medtech can — sign in to the app, register patients, read smears — plus administration. The
-- app never checked membership, so org admins were already doing fieldwork; only the console
-- refused to assign them and ignored their links when deciding whether a patient keeps someone.
--
-- "Can do fieldwork" is now any ACTIVE member of the patient's laboratory, in either role:
--   * assigning accepts an active org admin or medtech of the laboratory;
--   * removing is refused when no other active member of the laboratory would stay linked;
--   * handing over (console_replace_assignment, unchanged) calls both, so it follows.
-- Deactivated members of either role are never assignable and never count as cover.
--
-- New audit entries name the person as `member_id` / `member` and record their `role`. Entries
-- written by admin/0007 keep `medtech_id` / `medtech`; the console reads both.
--
-- Additive only: two functions are replaced in place with the same signatures and grants. No
-- table, policy or anything the app owns is altered.

begin;


create or replace function public.console_assign_patient(p_patient uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_org      uuid := public.console_require_patient_admin(p_patient);
    v_role     text;
    v_inserted integer;
begin
    select m.role into v_role
    from public.organization_members m
    where m.user_id = p_user and m.organization_id = v_org and m.status = 'active';
    if v_role is null then
        raise exception 'Only an active member of this laboratory can be assigned'
            using errcode = '42501', hint = 'not_assignable';
    end if;

    insert into public.patient_users (patient_id, user_id)
    values (p_patient, p_user)
    on conflict do nothing;
    get diagnostics v_inserted = row_count;

    if v_inserted > 0 then
        perform public.console_write_audit(
            'assignment.add', 'patient', p_patient::text, v_org,
            jsonb_build_object('member_id', p_user,
                               'member', public.console_person_label(p_user),
                               'role', v_role));
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
    v_org  uuid := public.console_require_patient_admin(p_patient);
    v_role text;
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
                     and m.status = 'active') then
        raise exception 'A patient keeps at least one active member of its laboratory'
            using errcode = '23514', hint = 'last_assignment';
    end if;

    -- Their role in this laboratory, for the audit line; null for a link from outside it.
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

-- `create or replace` keeps the grants admin/0007 set; restated so this file stands alone.
revoke execute on function public.console_assign_patient(uuid, uuid) from public, anon;
revoke execute on function public.console_unassign_patient(uuid, uuid) from public, anon;
grant execute on function public.console_assign_patient(uuid, uuid) to authenticated;
grant execute on function public.console_unassign_patient(uuid, uuid) to authenticated;

commit;
