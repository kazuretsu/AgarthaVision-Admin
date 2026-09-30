-- admin/0003 · exports are audited, under the right organization, by console users only.

create temporary table fx3 on commit drop as
select tests.create_user('s3@example.test', 'admin') as super_admin,
       tests.create_user('admin.a3@example.test')   as admin_a,
       tests.create_user('tech.a3@example.test')    as medtech_a,
       null::uuid as lab_a, null::uuid as lab_b;
grant select on fx3 to authenticated;

do $$
declare
    f fx3;
begin
    select * into f from fx3;
    perform tests.act_as(f.super_admin);
    f.lab_a := public.console_create_organization('Export Lab A');
    f.lab_b := public.console_create_organization('Export Lab B');
    perform tests.act_as_owner();
    insert into public.organization_members (user_id, organization_id, role) values
        (f.admin_a, f.lab_a, 'org_admin'), (f.medtech_a, f.lab_a, 'medtech');

    -- An org admin's export is filed under their own laboratory, whatever they pass.
    perform tests.act_as(f.admin_a);
    perform public.console_record_export(f.lab_b, '{"rows": 3}'::jsonb);
    perform tests.act_as_owner();
    perform tests.check(
        (select organization_id from public.admin_audit_log
          where action = 'export.research' and actor_id = f.admin_a) = f.lab_a,
        'an org admin cannot file an export under another laboratory');

    -- A super admin's export is filed under the organization they chose, or none.
    perform tests.act_as(f.super_admin);
    perform public.console_record_export(null, '{"rows": 9}'::jsonb);
    perform public.console_record_export(f.lab_b, '{"rows": 1}'::jsonb);
    perform tests.act_as_owner();
    perform tests.check(
        (select count(*) from public.admin_audit_log
          where action = 'export.research' and actor_id = f.super_admin) = 2,
        'a super admin''s exports are recorded');

    -- A medtech is refused.
    perform tests.act_as(f.medtech_a);
    perform tests.expect_error(
        'select public.console_record_export(null, ''{}''::jsonb)', '42501',
        'a medtech cannot record an export');

    -- And the org admin cannot touch the trail either.
    perform tests.act_as(f.admin_a);
    perform tests.expect_error('update public.admin_audit_log set details = ''{}''', '42501',
        'an org admin cannot edit an audit entry');
    perform tests.expect_error('delete from public.admin_audit_log', '42501',
        'an org admin cannot delete an audit entry');
    perform tests.check(
        not exists (select 1 from public.admin_audit_log where organization_id = f.lab_b),
        'an org admin cannot read another laboratory''s entries');
end
$$;
