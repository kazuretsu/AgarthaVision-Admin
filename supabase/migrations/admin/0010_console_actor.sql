-- admin/0010 · Who the signed-in person is to the console, in one call
--
-- Run via: Supabase dashboard → SQL Editor → paste → Run. By hand, once.
-- Requires: admin/0001_organizations.sql (organizations, organization_members) and the app's
-- 0014_super_admins.sql (is_admin()).
--
-- ── Why (14zcqntkd0y) ────────────────────────────────────────────────────────
-- The console re-checks access on every page, so a revoked admin is locked out on their next
-- click. That check was three reads one after another — the profile's name, is_admin(), then
-- the membership — before the page could read anything. This returns all three facts in one
-- round trip. It decides nothing: the console resolves access from these facts exactly as before
-- (super admin by an active super_admins grant; org admin by an active org_admin membership in an
-- active organization; never profiles.role, never a JWT claim).
--
-- It answers only about the caller (auth.uid()), and only facts the caller could already read:
-- their own profile, their own membership and organization (RLS lets every user read those), and
-- is_admin(), which anyone may ask about themselves.
--
-- Additive only: one function. Nothing the app owns is altered.

begin;

create or replace function public.console_actor()
returns table (
    full_name           text,
    is_super_admin      boolean,
    organization_id     uuid,
    organization_name   text,
    member_role         text,
    member_status       text,
    organization_status text
)
language sql
stable
security definer
set search_path = public
as $$
    select p.full_name,
           coalesce(public.is_admin(me.id), false),
           m.organization_id,
           o.name,
           m.role,
           m.status,
           o.status
    from (select auth.uid() as id) me
    left join public.profiles p on p.id = me.id
    left join public.organization_members m on m.user_id = me.id
    left join public.organizations o on o.id = m.organization_id
    where me.id is not null;
$$;

revoke execute on function public.console_actor() from public, anon;
grant execute on function public.console_actor() to authenticated;

commit;
