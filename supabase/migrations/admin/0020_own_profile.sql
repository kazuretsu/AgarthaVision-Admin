-- admin/0020 · An admin changes their own name, and their password change is recorded
--
-- Run via: Supabase dashboard → SQL Editor → paste → Run. By hand, once.
-- Requires: admin/0001 (console_write_audit, console_org_admin_org); the app's
-- 0014_super_admins.sql (is_admin()).
--
-- ── Why (14zcqntr35e) ────────────────────────────────────────────────────────
-- Settings lets a console user (a super admin, or an active org admin) change the name the
-- console shows for them and their password. `profiles` has no update policy, so the name is
-- written here, for the caller's own row only. The password lives at the auth provider and
-- never reaches the database; this migration only records that it changed.
--
-- ── Who may ──────────────────────────────────────────────────────────────────
--   * A SUPER ADMIN or an ACTIVE ORG ADMIN, for themselves. There is no argument naming the
--     person: the row is always the caller's, so nobody can rename anyone else.
--   * Nobody else: a medtech, a deactivated org admin, a visitor. Refused with 42501.
--
-- ── Where the entry is filed ─────────────────────────────────────────────────
-- An org admin's change is filed under their laboratory, where its other admins read it; a
-- super admin's under no organization, so only super admins read it (admin/0001's policies).
--
-- ── Order for the password ───────────────────────────────────────────────────
-- The console records the change after the provider accepts it: a wrong current password is
-- refused there and leaves no entry. Nothing about the password is written, only that it
-- changed.
--
-- Additive only: two functions. Nothing is changed or deleted but the caller's own name and
-- the audit log.

begin;

-- The caller's laboratory when they are an active org admin, null for a super admin; refuses
-- everyone else. Internal to this migration's functions.
create or replace function public.console_own_profile_org()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_actor uuid := auth.uid();
    v_org   uuid;
begin
    if v_actor is null then
        raise exception 'Sign in first' using errcode = '42501';
    end if;
    if public.is_admin(v_actor) then
        return null;
    end if;
    v_org := public.console_org_admin_org(v_actor);
    if v_org is null then
        raise exception 'Only a console user changes their profile here' using errcode = '42501';
    end if;
    return v_org;
end;
$$;

revoke execute on function public.console_own_profile_org() from public, anon, authenticated;

-- Sets the caller's own name: trimmed, inner spaces collapsed, 1 to 120 characters. The same
-- name again changes and records nothing.
create or replace function public.console_set_own_name(p_full_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor    uuid := auth.uid();
    v_org      uuid := public.console_own_profile_org();
    v_name     text := nullif(regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g'), '');
    v_previous text;
begin
    if v_name is null then
        raise exception 'A name is required' using errcode = '22023', hint = 'name_required';
    end if;
    if length(v_name) > 120 then
        raise exception 'Name too long' using errcode = '22023', hint = 'name_too_long';
    end if;

    select p.full_name into v_previous from public.profiles p where p.id = v_actor for update;
    if not found then
        raise exception 'No profile for this account' using errcode = 'P0002';
    end if;
    if v_previous is not distinct from v_name then
        return;
    end if;

    update public.profiles set full_name = v_name where id = v_actor;

    perform public.console_write_audit(
        'profile.rename', 'user', v_actor::text, v_org,
        jsonb_build_object('name', v_name, 'previous_name', v_previous));
end;
$$;

-- Records that the caller changed their own password, after the provider accepted it.
create or replace function public.console_record_own_password_change()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor uuid := auth.uid();
    v_org   uuid := public.console_own_profile_org();
begin
    perform public.console_write_audit('profile.password_change', 'user', v_actor::text, v_org, '{}'::jsonb);
end;
$$;

revoke execute on function public.console_set_own_name(text) from public, anon;
revoke execute on function public.console_record_own_password_change() from public, anon;
grant execute on function public.console_set_own_name(text) to authenticated;
grant execute on function public.console_record_own_password_change() to authenticated;

commit;
