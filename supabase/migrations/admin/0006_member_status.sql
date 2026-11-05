-- admin/0006 · A laboratory's medtechs: who they are, and deactivating or reactivating them
--
-- Run via: Supabase dashboard → SQL Editor → paste → Run. By hand, once.
-- Requires: admin/0001_organizations.sql; the app's 0011_profile_outlives_login.sql
-- (profiles.account_id) and 0014_super_admins.sql (is_admin()).
--
-- ── Who may do what (Feature Specs §1) ───────────────────────────────────────
--   * An org admin sees their own laboratory's people and may deactivate or reactivate its
--     MEDTECHS — never themselves, another org admin, or anyone in another laboratory.
--   * A super admin may do the same for any laboratory.
--
-- ── Nothing is deleted (C8) ──────────────────────────────────────────────────
-- Deactivating sets the membership's status. The account, the profile and every record the
-- medtech authored stay exactly as they are. Blocking sign-in is done by the console through
-- the auth provider (a ban, not a deletion), before this function records the change.
-- Additive only: two functions, nothing the app owns is altered or dropped.

begin;


-- ── The people of one laboratory ─────────────────────────────────────────────
-- Members with their sign-in email and how many of the laboratory's patients each is linked
-- to. The email lives in the auth provider's table, which no client can read, so this is a
-- security-definer function that checks the caller itself.
create or replace function public.console_organization_people(p_organization_id uuid)
returns table (
    user_id           uuid,
    account_id        text,
    full_name         text,
    email             text,
    role              text,
    status            text,
    added_at          timestamptz,
    assigned_patients integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
    -- coalesce: a non-admin's organization is null, and `not (false or null)` would let them in.
    if not (public.is_admin(auth.uid())
            or coalesce(public.console_org_admin_org(auth.uid()) = p_organization_id, false)) then
        raise exception 'Not permitted to read this organization''s people' using errcode = '42501';
    end if;

    return query
    select m.user_id,
           p.account_id,
           p.full_name,
           u.email::text,
           m.role,
           m.status,
           m.added_at,
           (select count(*)::integer
              from public.patient_users pu
              join public.patient_organizations po on po.patient_id = pu.patient_id
             where pu.user_id = m.user_id
               and po.organization_id = p_organization_id)
    from public.organization_members m
    join public.profiles p on p.id = m.user_id
    left join auth.users u on u.id::text = p.account_id
    where m.organization_id = p_organization_id;
end;
$$;


-- ── Deactivate or reactivate a medtech ───────────────────────────────────────
create or replace function public.console_set_member_status(p_user uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor  uuid := auth.uid();
    v_member public.organization_members;
    v_label  text;
begin
    if p_status not in ('active', 'deactivated') then
        raise exception 'Unknown member status %', p_status using errcode = '22023';
    end if;

    select * into v_member from public.organization_members m where m.user_id = p_user for update;
    if not found then
        raise exception 'Member % does not exist', p_user using errcode = 'P0002';
    end if;

    if not (public.is_admin(v_actor)
            or coalesce(public.console_org_admin_org(v_actor) = v_member.organization_id, false)) then
        raise exception 'Not permitted to change this member' using errcode = '42501';
    end if;
    if p_user = v_actor then
        raise exception 'Nobody deactivates themselves' using errcode = '42501';
    end if;
    if v_member.role <> 'medtech' then
        raise exception 'Only a medtech is deactivated here' using errcode = '42501';
    end if;
    if v_member.status = p_status then
        return;
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

revoke execute on function public.console_organization_people(uuid) from public, anon;
revoke execute on function public.console_set_member_status(uuid, text) from public, anon;
grant execute on function public.console_organization_people(uuid) to authenticated;
grant execute on function public.console_set_member_status(uuid, text) to authenticated;

commit;
