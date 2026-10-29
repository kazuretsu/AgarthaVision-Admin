-- admin/0021 · Sign-in follows access: who loses it when a laboratory or a grant goes, recorded
--
-- Run via: Supabase dashboard → SQL Editor → paste → Run. By hand, once.
-- Requires: admin/0001 (console_write_audit, console_member_org); the app's
-- 0014_super_admins.sql (is_admin()).
--
-- ── Why (14zcqntnqpd) ────────────────────────────────────────────────────────
-- Deactivating a member already blocks their sign-in at the auth provider (a ban), which also
-- stops the mobile app refreshing its session. Deactivating a LABORATORY, and revoking a SUPER
-- ADMIN, did not: the console refused them on their next page, but the phone kept working on
-- its refresh token. The console now blocks the sign-in of everyone such a change leaves with
-- no access anywhere, and restores it when a laboratory is reactivated.
--
-- "Access" is what the console gate and the app's policies already read: an active super admin
-- grant (`is_admin()`), or an active membership in an active laboratory
-- (`console_member_org()`). Someone who still has either keeps their sign-in.
--
-- ── Order ────────────────────────────────────────────────────────────────────
-- As with an authenticator reset (admin/0018), the console records first and acts after: a
-- block nobody recorded must not happen. `console_record_sign_in_change` returns exactly the
-- logins to change and writes one entry for each; the console then bans or unbans them. If
-- that then fails, the entry stands for a change that was attempted, and the console says so.
--
-- ── Who may ──────────────────────────────────────────────────────────────────
--   * `console_record_sign_in_change`: a SUPER ADMIN (laboratory status and super admin grants
--     are theirs). Anyone else, 42501.
--   * `console_blocked_account_for_email`: the SERVICE ROLE only, for the console's server when
--     someone whose sign-in was blocked accepts a new invitation; no client can call it.
--
-- Additive only: two functions. Nothing is changed or deleted but the audit log.

begin;

-- The logins a change applies to, recorded before the console makes it. `p_block` true: those
-- of `p_users` left with no access, to block. False: those with access again, to restore. A
-- profile with no login (app 0011) has nothing to change and is left out.
create or replace function public.console_record_sign_in_change(
    p_users uuid[],
    p_block boolean,
    p_cause text
)
returns table (user_id uuid, account_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_row record;
begin
    if not public.is_admin(auth.uid()) then
        raise exception 'Only a super admin changes sign-in this way' using errcode = '42501';
    end if;
    if p_block is null or coalesce(btrim(p_cause), '') = '' then
        raise exception 'A direction and a cause are required' using errcode = '22023';
    end if;

    for v_row in
        select p.id, p.account_id,
               coalesce(nullif(btrim(p.full_name), ''), u.email::text) as label,
               (select m.organization_id from public.organization_members m
                 where m.user_id = p.id limit 1) as organization_id
        from public.profiles p
        left join auth.users u on u.id::text = p.account_id
        where p.id = any(coalesce(p_users, '{}'::uuid[]))
          and p.account_id is not null
          and (coalesce(public.is_admin(p.id), false)
               or public.console_member_org(p.id) is not null) = not p_block
    loop
        perform public.console_write_audit(
            case when p_block then 'account.sign_in_blocked' else 'account.sign_in_restored' end,
            'user', v_row.id::text, v_row.organization_id,
            jsonb_build_object('name', v_row.label, 'cause', p_cause));
        user_id := v_row.id;
        account_id := v_row.account_id;
        return next;
    end loop;
end;
$$;

revoke execute on function public.console_record_sign_in_change(uuid[], boolean, text) from public, anon;
grant execute on function public.console_record_sign_in_change(uuid[], boolean, text) to authenticated;

-- The login for this email when its sign-in is blocked, else null. For accepting an invitation
-- with an account that exists: its sign-in is restored only for the attempt.
create or replace function public.console_blocked_account_for_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select u.id from auth.users u
    where lower(u.email) = lower(btrim(p_email))
      and u.banned_until is not null and u.banned_until > now()
    limit 1;
$$;

revoke execute on function public.console_blocked_account_for_email(text) from public, anon, authenticated;
grant execute on function public.console_blocked_account_for_email(text) to service_role;

commit;
