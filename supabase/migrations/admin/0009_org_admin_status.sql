-- admin/0009 · Deactivating and reactivating org admins; nobody's patients are left uncovered
--
-- Run via: Supabase dashboard → SQL Editor → paste → Run. By hand, once.
-- Requires: admin/0006_member_status.sql (the function this replaces), admin/0007 and
-- admin/0008 (who covers a patient: any active member of its laboratory).
--
-- ── Who may do what (14zcqntkd0x) ────────────────────────────────────────────
--   * A SUPER ADMIN deactivates and reactivates anyone in any laboratory, org admins included.
--   * An ORG ADMIN does the same for their own laboratory's MEDTECHS only — never an org admin:
--     super admins make org admins (by invitation), so super admins unmake them.
--   * Nobody changes their own status.
--
-- ── What deactivating may not leave behind ───────────────────────────────────
--   * A laboratory with no active org admin. Without one, nobody there can invite medtechs or
--     assign patients. Invite the replacement first; to close a laboratory, deactivate the
--     organization instead (admin/0001).
--   * A patient with no active member of its laboratory (the rule admin/0007 and admin/0008
--     enforce on removing an assignment). Hand those patients over first.
-- Both are refused with SQLSTATE 23514 and a hint (`last_org_admin`, `sole_cover`). Reactivating
-- is never refused for these.
--
-- Nothing is deleted (C8): the membership's status changes; the account, profile, patient links
-- and records stay. Blocking sign-in is the console's ban, done before this function runs.
--
-- Additive only: one function replaced with the same signature and grants, one read added.

begin;


-- Patients of the member's laboratory that only this member covers: linked to them, and to no
-- other active member of that laboratory. The rows are the patients' `patient_users` links,
-- locked by the caller where it matters (console_set_member_status).
create or replace function public.console_sole_cover_patient_ids(p_user uuid, p_organization uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
    select pu.patient_id
    from public.patient_users pu
    join public.patient_organizations po
      on po.patient_id = pu.patient_id and po.organization_id = p_organization
    where pu.user_id = p_user
      and not exists (
          select 1 from public.patient_users other
          join public.organization_members m
            on m.user_id = other.user_id and m.organization_id = p_organization
          where other.patient_id = pu.patient_id
            and other.user_id <> p_user
            and m.status = 'active');
$$;

revoke execute on function public.console_sole_cover_patient_ids(uuid, uuid) from public, anon, authenticated;


-- ── Read: the patients a member is the only active cover for ─────────────────
-- What the console lists before a deactivation, so they can be handed over first. Same caller
-- check as console_member_patients (admin/0007); patient ids only, so it says nothing a
-- super admin may not read (constraint #14).
create or replace function public.console_member_sole_cover(p_user uuid)
returns table (patient_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
    v_org uuid;
begin
    select m.organization_id into v_org from public.organization_members m where m.user_id = p_user;
    if v_org is null then
        raise exception 'Member % does not exist', p_user using errcode = 'P0002';
    end if;
    if not (public.is_admin(auth.uid())
            or coalesce(public.console_org_admin_org(auth.uid()) = v_org, false)) then
        raise exception 'Not permitted to read this member''s patients' using errcode = '42501';
    end if;

    return query select ids from public.console_sole_cover_patient_ids(p_user, v_org) as ids;
end;
$$;


-- ── Deactivate or reactivate a member ────────────────────────────────────────
create or replace function public.console_set_member_status(p_user uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor  uuid := auth.uid();
    v_super  boolean := public.is_admin(v_actor);
    v_member public.organization_members;
    v_label  text;
    v_count  integer;
begin
    if p_status not in ('active', 'deactivated') then
        raise exception 'Unknown member status %', p_status using errcode = '22023';
    end if;

    select * into v_member from public.organization_members m where m.user_id = p_user for update;
    if not found then
        raise exception 'Member % does not exist', p_user using errcode = 'P0002';
    end if;

    if not (v_super
            or coalesce(public.console_org_admin_org(v_actor) = v_member.organization_id, false)) then
        raise exception 'Not permitted to change this member' using errcode = '42501';
    end if;
    if p_user = v_actor then
        raise exception 'Nobody deactivates themselves' using errcode = '42501';
    end if;
    if v_member.role = 'org_admin' and not v_super then
        raise exception 'Only a super admin changes an organization admin''s access'
            using errcode = '42501';
    end if;
    if v_member.status = p_status then
        return;
    end if;

    if p_status = 'deactivated' then
        if v_member.role = 'org_admin' then
            -- Lock the laboratory's org admins, so two deactivations cannot each leave the other.
            perform 1 from public.organization_members m
             where m.organization_id = v_member.organization_id and m.role = 'org_admin'
               for update;
            if not exists (select 1 from public.organization_members m
                           where m.organization_id = v_member.organization_id
                             and m.role = 'org_admin' and m.status = 'active'
                             and m.user_id <> p_user) then
                raise exception 'A laboratory keeps at least one active organization admin'
                    using errcode = '23514', hint = 'last_org_admin';
            end if;
        end if;

        -- Lock the links of every patient this member is on — the same rows assigning and
        -- removing lock — so no concurrent change can leave one of them with nobody.
        perform 1 from public.patient_users pu
         where pu.patient_id in (select mine.patient_id from public.patient_users mine
                                  where mine.user_id = p_user)
           for update;
        select count(*) into v_count
        from public.console_sole_cover_patient_ids(p_user, v_member.organization_id);
        if v_count > 0 then
            raise exception 'The only active member on % patient(s); hand them over first', v_count
                using errcode = '23514', hint = 'sole_cover';
        end if;
    end if;

    update public.organization_members set status = p_status where user_id = p_user;

    select coalesce(nullif(btrim(p.full_name), ''), u.email) into v_label
    from public.profiles p left join auth.users u on u.id::text = p.account_id
    where p.id = p_user;

    perform public.console_write_audit(
        case when p_status = 'deactivated' then 'member.deactivate' else 'member.reactivate' end,
        'member', p_user::text, v_member.organization_id,
        jsonb_build_object('name', v_label, 'role', v_member.role));
end;
$$;

revoke execute on function public.console_member_sole_cover(uuid) from public, anon;
revoke execute on function public.console_set_member_status(uuid, text) from public, anon;
grant execute on function public.console_member_sole_cover(uuid) to authenticated;
grant execute on function public.console_set_member_status(uuid, text) to authenticated;

commit;
