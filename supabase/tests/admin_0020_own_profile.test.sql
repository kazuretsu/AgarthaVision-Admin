-- admin/0020 · a console user renames only themselves, and their password change is recorded
-- under their laboratory, or under none for a super admin (14zcqntr35e).

create temporary table fx20 on commit drop as
select tests.create_user('s20@example.test', 'admin')     as super_admin,
       tests.create_user('admin.a20@example.test')        as org_admin,
       tests.create_user('admin2.a20@example.test')       as org_admin_off,
       tests.create_user('tech.a20@example.test')         as tech,
       tests.create_user('loner20@example.test')          as no_member,
       null::uuid as lab;
grant select on fx20 to authenticated;

do $$
declare
    f fx20;
begin
    select * into f from fx20;
    perform tests.act_as(f.super_admin);
    f.lab := public.console_create_organization('Profile Lab');
    perform tests.act_as_owner();
    insert into public.organization_members (user_id, organization_id, role, status) values
        (f.org_admin, f.lab, 'org_admin', 'active'),
        (f.org_admin_off, f.lab, 'org_admin', 'deactivated'),
        (f.tech, f.lab, 'medtech', 'active');

    -- ── An org admin renames themselves: stored tidy, filed under their laboratory ──
    perform tests.act_as(f.org_admin);
    perform public.console_set_own_name('  Ana   Reyes ');
    perform tests.act_as_owner();
    perform tests.check(
        (select full_name from public.profiles where id = f.org_admin) = 'Ana Reyes',
        'the name is trimmed and spaced once');
    perform tests.check(
        exists (select 1 from public.admin_audit_log
                 where action = 'profile.rename' and target_id = f.org_admin::text
                   and actor_id = f.org_admin and organization_id = f.lab
                   and details->>'name' = 'Ana Reyes' and details->>'previous_name' = 'admin.a20'),
        'an org admin''s rename is audited under their laboratory, with the old name');

    -- The same name again records nothing.
    perform tests.act_as(f.org_admin);
    perform public.console_set_own_name('Ana Reyes');
    perform tests.act_as_owner();
    perform tests.check(
        (select count(*) from public.admin_audit_log
          where action = 'profile.rename' and actor_id = f.org_admin) = 1,
        'an unchanged name writes no entry');

    -- ── A super admin: filed under no organization ──
    perform tests.act_as(f.super_admin);
    perform public.console_set_own_name('Sol Admin');
    perform tests.act_as_owner();
    perform tests.check(
        exists (select 1 from public.admin_audit_log
                 where action = 'profile.rename' and actor_id = f.super_admin
                   and organization_id is null),
        'a super admin''s rename is audited with no organization');

    -- ── Bad names ──
    perform tests.act_as(f.org_admin);
    perform tests.expect_error(
        'select public.console_set_own_name(''   '')', '22023', 'a blank name is refused');
    perform tests.expect_error(
        'select public.console_set_own_name(null)', '22023', 'no name is refused');
    perform tests.expect_error(
        format('select public.console_set_own_name(%L)', repeat('a', 121)),
        '22023', 'a name over 120 characters is refused');

    -- ── Nobody else ──
    perform tests.act_as(f.tech);
    perform tests.expect_error(
        'select public.console_set_own_name(''Tech'')', '42501', 'a medtech cannot rename here');
    perform tests.expect_error(
        'select public.console_record_own_password_change()', '42501',
        'a medtech''s password change is not a console event');
    perform tests.act_as(f.org_admin_off);
    perform tests.expect_error(
        'select public.console_set_own_name(''Off'')', '42501',
        'a deactivated org admin cannot rename here');
    perform tests.act_as(f.no_member);
    perform tests.expect_error(
        'select public.console_set_own_name(''Nobody'')', '42501',
        'someone with no console access cannot rename here');
    perform tests.act_as_owner();
    execute 'set local role anon';
    perform tests.expect_error(
        'select public.console_set_own_name(''Anon'')', '42501', 'a visitor cannot rename');
    perform tests.act_as_owner();
    perform tests.check(
        (select full_name from public.profiles where id = f.tech) = 'tech.a20',
        'a refused rename changes nothing');

    -- The internal helper is not callable from outside.
    perform tests.act_as(f.org_admin);
    perform tests.expect_error(
        'select public.console_own_profile_org()', '42501', 'the helper is internal');

    -- ── Password changes: recorded with nothing about the password ──
    perform public.console_record_own_password_change();
    perform tests.act_as(f.super_admin);
    perform public.console_record_own_password_change();
    perform tests.act_as_owner();
    perform tests.check(
        exists (select 1 from public.admin_audit_log
                 where action = 'profile.password_change' and actor_id = f.org_admin
                   and organization_id = f.lab and details = '{}'::jsonb),
        'an org admin''s password change is audited under their laboratory, with no details');
    perform tests.check(
        exists (select 1 from public.admin_audit_log
                 where action = 'profile.password_change' and actor_id = f.super_admin
                   and organization_id is null),
        'a super admin''s password change is audited with no organization');
end
$$;
