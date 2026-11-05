-- app 0014 · The console recognises super admins from the super_admins table (D22).
--
-- Needs an app checkout with 0014_super_admins.sql. The console's gate calls
-- `public.is_admin(user_id)` as the signed-in user (`src/adapters/supabase/auth.ts`), so
-- these checks make the same call the same way, and confirm the database agrees.

do $$
begin
    if to_regclass('public.super_admins') is null then
        raise exception 'FAILED: the app checkout has no super_admins table (app 0014). '
            'Point AGARTHAVISION_APP_DIR at a checkout that has 0014.';
    end if;
end
$$;

create temporary table fx14 (granted uuid, revoked uuid, medtech uuid) on commit drop;
grant select on fx14 to authenticated;

do $$
declare
    f fx14;
begin
    perform tests.act_as_owner();

    -- An active grant and a profile that says medtech: a super admin.
    f.granted := tests.create_user('granted14@example.test');
    insert into public.super_admins (user_id) values (f.granted);

    -- A revoked grant and a profile that still says admin: not a super admin.
    f.revoked := tests.create_user('revoked14@example.test', 'admin');
    update public.super_admins set revoked_at = now() where user_id = f.revoked;
    update public.profiles set role = 'admin' where id = f.revoked;

    f.medtech := tests.create_user('tech14@example.test');

    insert into fx14 select f.*;
end
$$;

-- ── The console's call, as each user makes it ────────────────────────────────
do $$
declare
    f fx14;
begin
    select * into f from fx14;

    perform tests.act_as(f.granted);
    perform tests.check(public.is_admin(f.granted),
        'an active grant makes a super admin even though profiles.role says medtech');
    perform tests.check(public.console_create_organization('Granted Lab') is not null,
        'the database lets that super admin create an organization');

    perform tests.act_as(f.revoked);
    perform tests.check(not public.is_admin(f.revoked),
        'a revoked grant is not a super admin even though profiles.role says admin');
    perform tests.expect_error(
        format('select public.console_create_organization(%L)', 'Revoked Lab'), '42501',
        'the database refuses a revoked super admin the same way');

    perform tests.act_as(f.medtech);
    perform tests.check(not public.is_admin(f.medtech), 'a medtech with no grant is not one');
end
$$;

-- ── A revoke takes effect on the next call ───────────────────────────────────
do $$
declare
    f fx14;
begin
    select * into f from fx14;

    perform tests.act_as_owner();
    update public.super_admins set revoked_at = now() where user_id = f.granted;

    perform tests.act_as(f.granted);
    perform tests.check(not public.is_admin(f.granted),
        'revoking the grant turns the super admin away at the next call');
end
$$;

-- ── The table itself stays out of reach ──────────────────────────────────────
do $$
declare
    f fx14;
begin
    select * into f from fx14;

    perform tests.act_as(f.medtech);
    perform tests.expect_error('select 1 from public.super_admins', '42501',
        'a signed-in user cannot read the grants directly');
end
$$;
