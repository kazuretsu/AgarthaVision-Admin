-- admin/0017 · a super admin's reset of an org admin's authenticator app is recorded; nobody else's.

create temporary table fx17 on commit drop as
select tests.create_user('s17@example.test', 'admin')   as super_admin,
       tests.create_user('s17b@example.test', 'admin')  as super_admin_2,
       tests.create_user('admin.a17@example.test')      as org_admin,
       tests.create_user('admin2.a17@example.test')     as org_admin_2,
       tests.create_user('tech.a17@example.test')       as tech,
       tests.create_user('loner17@example.test')        as no_member,
       null::uuid as lab;
grant select on fx17 to authenticated;

do $$
declare
    f fx17;
begin
    select * into f from fx17;
    perform tests.act_as(f.super_admin);
    f.lab := public.console_create_organization('Reset Lab');
    perform tests.act_as_owner();
    insert into public.organization_members (user_id, organization_id, role) values
        (f.org_admin, f.lab, 'org_admin'), (f.org_admin_2, f.lab, 'org_admin'),
        (f.tech, f.lab, 'medtech');

    -- ── A super admin, for an org admin: recorded under the laboratory ──
    perform tests.act_as(f.super_admin);
    perform public.console_record_authenticator_reset(f.org_admin);
    perform tests.act_as_owner();
    perform tests.check(
        exists (select 1 from public.admin_audit_log
                 where action = 'member.authenticator_reset' and target_type = 'member'
                   and target_id = f.org_admin::text and organization_id = f.lab
                   and actor_id = f.super_admin and details->>'role' = 'org_admin'),
        'a super admin''s reset of an org admin''s app is audited under their laboratory');
    perform tests.check(
        (select status from public.organization_members where user_id = f.org_admin) = 'active',
        'recording a reset changes nothing else');

    -- ── Nobody else, and never for themselves ──
    perform tests.act_as(f.org_admin_2);
    perform tests.expect_error(
        format('select public.console_record_authenticator_reset(%L)', f.org_admin),
        '42501', 'an org admin cannot reset a fellow org admin''s app');
    perform tests.act_as(f.tech);
    perform tests.expect_error(
        format('select public.console_record_authenticator_reset(%L)', f.org_admin),
        '42501', 'a medtech cannot reset anyone''s app');
    perform tests.act_as(f.super_admin);
    perform tests.expect_error(
        format('select public.console_record_authenticator_reset(%L)', f.super_admin),
        '42501', 'a super admin cannot reset their own app here');
    perform tests.expect_error(
        format('select public.console_record_authenticator_reset(%L)', f.super_admin_2),
        'P0002', 'another super admin is no member: their app is reset in the Supabase dashboard');
    perform tests.expect_error(
        format('select public.console_record_authenticator_reset(%L)', f.tech),
        '42501', 'a medtech has no console app to reset');
    perform tests.expect_error(
        format('select public.console_record_authenticator_reset(%L)', f.no_member),
        'P0002', 'an unknown member is refused');

    perform tests.act_as_owner();
    perform tests.check(
        (select count(*) from public.admin_audit_log where action = 'member.authenticator_reset') = 1,
        'a refused reset records nothing');
end
$$;
