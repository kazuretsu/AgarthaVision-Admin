-- admin/0018 · Recording a super admin's reset of an org admin's authenticator app
--
-- Run via: Supabase dashboard → SQL Editor → paste → Run. By hand, once.
-- Requires: admin/0001 (console_write_audit), admin/0009 (org admin status).
--
-- ── Why (14zcqntjnt0) ────────────────────────────────────────────────────────
-- Super admins and org admins sign in to the console with a password and a code from an
-- authenticator app. Someone who loses their phone cannot sign in; a super admin resets their
-- app, and they set up a new one at their next sign-in. The reset itself happens at the auth
-- provider (the console's service-role call, like a ban); this function is its audit entry.
--
-- ── Order ────────────────────────────────────────────────────────────────────
-- The console records first and resets after, as an export is recorded before the file leaves
-- (admin/0003): a reset nobody recorded must not happen. If the reset then fails, the entry
-- stands for a reset that was attempted, and the console says it did not happen.
--
-- ── Who may ──────────────────────────────────────────────────────────────────
--   * A SUPER ADMIN, for an ORG ADMIN of any laboratory. Never themselves: a stolen session
--     could otherwise replace the app it was meant to need.
--   * Nobody else. An org admin's lost phone is a super admin's call; a medtech has no console
--     app. A super admin's own lost phone is reset in the Supabase dashboard.
-- Refused with 42501; an unknown member with P0002.
--
-- Additive only: one function. Nothing is changed or deleted in any table but the audit log.

begin;

create or replace function public.console_record_authenticator_reset(p_user uuid)
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
    if not public.is_admin(v_actor) then
        raise exception 'Only a super admin resets an authenticator app' using errcode = '42501';
    end if;
    if p_user = v_actor then
        raise exception 'Nobody resets their own authenticator app here' using errcode = '42501';
    end if;

    select * into v_member from public.organization_members m where m.user_id = p_user;
    if not found then
        raise exception 'Member % does not exist', p_user using errcode = 'P0002';
    end if;
    if v_member.role <> 'org_admin' then
        raise exception 'Only an organization admin has a console authenticator app'
            using errcode = '42501';
    end if;

    select coalesce(nullif(btrim(p.full_name), ''), u.email) into v_label
    from public.profiles p left join auth.users u on u.id::text = p.account_id
    where p.id = p_user;

    perform public.console_write_audit(
        'member.authenticator_reset', 'member', p_user::text, v_member.organization_id,
        jsonb_build_object('name', v_label, 'role', v_member.role));
end;
$$;

revoke execute on function public.console_record_authenticator_reset(uuid) from public, anon;
grant execute on function public.console_record_authenticator_reset(uuid) to authenticated;

commit;
