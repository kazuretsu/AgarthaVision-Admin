-- admin/0017 · Offboard a medtech: reassign their open patients and deactivate them
--
-- Run via: Supabase dashboard → SQL Editor → paste → Run. By hand, once.
-- Requires: admin/0001, admin/0007, admin/0008, admin/0009.
--
-- ── The rule (14zcqntjnt5, Feature Specs §1) ──────────────────────────────────
-- When a medtech leaves the laboratory, their open work must not be stranded.
-- An org admin (or super admin) offboards the medtech:
--   * Sole-cover patients (or chosen assigned patients) are reassigned to active colleagues
--     in the same laboratory.
--   * Removing an assignment removes only access (the patient_users link) and leaves
--     authorship (sessions, samples, reports) unchanged.
--   * After reassignments, the leaver is checked to ensure no patient is left with no active member.
--   * The medtech's membership status is set to 'deactivated'.
--   * The audit trail records the assignment handovers and the member offboarding as a grouped set.
--
-- Additive only: one new security-definer function, no table or policy changes.

begin;

create or replace function public.console_offboard_member(
    p_user          uuid,
    p_reassignments jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor          uuid := auth.uid();
    v_super          boolean := public.is_admin(v_actor);
    v_member         public.organization_members;
    v_org            uuid;
    v_label          text;
    v_item           record;
    v_patient_id     uuid;
    v_to_user_id     uuid;
    v_to_role        text;
    v_count          integer := 0;
    v_remaining      integer;
begin
    select * into v_member from public.organization_members m where m.user_id = p_user for update;
    if not found then
        raise exception 'Member % does not exist', p_user using errcode = 'P0002';
    end if;

    v_org := v_member.organization_id;

    if not (v_super or coalesce(public.console_org_admin_org(v_actor) = v_org, false)) then
        raise exception 'Not permitted to offboard this member' using errcode = '42501';
    end if;
    if p_user = v_actor then
        raise exception 'Nobody offboards themselves' using errcode = '42501';
    end if;
    if v_member.role <> 'medtech' then
        raise exception 'Only a medtech is offboarded here' using errcode = '42501';
    end if;
    if v_member.status = 'deactivated' then
        return;
    end if;

    -- Lock patient links for all patients this member is assigned to.
    perform 1 from public.patient_users pu
     where pu.patient_id in (select mine.patient_id from public.patient_users mine
                              where mine.user_id = p_user)
       for update;

    -- Process reassignments
    if p_reassignments is not null and jsonb_typeof(p_reassignments) = 'array' then
        for v_item in select * from jsonb_to_recordset(p_reassignments) as x(patient_id uuid, to_user_id uuid)
        loop
            v_patient_id := v_item.patient_id;
            v_to_user_id := v_item.to_user_id;

            if v_patient_id is not null and v_to_user_id is not null then
                if v_to_user_id = p_user then
                    raise exception 'Choose a different colleague' using errcode = '22023', hint = 'same';
                end if;

                if not exists (select 1 from public.patient_organizations po
                               where po.patient_id = v_patient_id and po.organization_id = v_org) then
                    raise exception 'Patient % does not belong to this laboratory', v_patient_id using errcode = '42501';
                end if;

                if not exists (select 1 from public.patient_users pu
                               where pu.patient_id = v_patient_id and pu.user_id = p_user) then
                    raise exception 'Patient % is not assigned to this member', v_patient_id using errcode = 'P0002';
                end if;

                select m.role into v_to_role
                from public.organization_members m
                where m.user_id = v_to_user_id and m.organization_id = v_org and m.status = 'active';
                if v_to_role is null then
                    raise exception 'Only an active member of this laboratory can be assigned'
                        using errcode = '42501', hint = 'not_assignable';
                end if;

                -- Assign to successor
                insert into public.patient_users (patient_id, user_id)
                values (v_patient_id, v_to_user_id)
                on conflict do nothing;

                perform public.console_write_audit(
                    'assignment.add', 'patient', v_patient_id::text, v_org,
                    jsonb_build_object(
                        'member_id', v_to_user_id,
                        'member', public.console_person_label(v_to_user_id),
                        'role', v_to_role
                    )
                );

                -- Remove from leaver
                delete from public.patient_users
                where patient_id = v_patient_id and user_id = p_user;

                perform public.console_write_audit(
                    'assignment.remove', 'patient', v_patient_id::text, v_org,
                    jsonb_build_object(
                        'member_id', p_user,
                        'member', public.console_person_label(p_user),
                        'role', v_member.role
                    )
                );

                v_count := v_count + 1;
            end if;
        end loop;
    end if;

    -- Verify that no patient of this organization is left with no active member
    select count(*) into v_remaining
    from public.console_sole_cover_patient_ids(p_user, v_org);
    if v_remaining > 0 then
        raise exception 'The only active member on % patient(s); all must be handed over', v_remaining
            using errcode = '23514', hint = 'sole_cover';
    end if;

    -- Deactivate the member
    update public.organization_members set status = 'deactivated' where user_id = p_user;

    select coalesce(nullif(btrim(p.full_name), ''), u.email) into v_label
    from public.profiles p left join auth.users u on u.id::text = p.account_id
    where p.id = p_user;

    perform public.console_write_audit(
        'member.offboard', 'member', p_user::text, v_org,
        jsonb_build_object(
            'name', v_label,
            'role', v_member.role,
            'reassigned_patients', v_count
        )
    );
end;
$$;

revoke execute on function public.console_offboard_member(uuid, jsonb) from public, anon;
grant execute on function public.console_offboard_member(uuid, jsonb) to authenticated;

commit;
