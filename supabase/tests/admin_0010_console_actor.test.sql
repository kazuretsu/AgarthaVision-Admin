-- admin/0010 · console_actor(): the gate's three facts in one call, about the caller only.

create temporary table fx10 on commit drop as
select tests.create_user('s10@example.test', 'admin') as super_admin,
       tests.create_user('admin.a10@example.test')    as admin_a,
       tests.create_user('admin.off10@example.test')  as admin_off,
       tests.create_user('tech.a10@example.test')     as tech_a,
       tests.create_user('admin.b10@example.test')    as admin_b,
       tests.create_user('loner10@example.test')      as loner,
       null::uuid as lab_a, null::uuid as lab_b;
grant select on fx10 to authenticated;

do $$
declare
    f fx10;
    r record;
    n integer;
begin
    select * into f from fx10;
    perform tests.act_as(f.super_admin);
    f.lab_a := public.console_create_organization('Actor Lab A');
    f.lab_b := public.console_create_organization('Actor Lab B');
    perform public.console_set_organization_status(f.lab_b, 'deactivated');
    perform tests.act_as_owner();
    insert into public.organization_members (user_id, organization_id, role, status) values
        (f.admin_a, f.lab_a, 'org_admin', 'active'),
        (f.admin_off, f.lab_a, 'org_admin', 'deactivated'),
        (f.tech_a, f.lab_a, 'medtech', 'active'),
        (f.admin_b, f.lab_b, 'org_admin', 'active');

    perform tests.act_as(f.super_admin);
    select * into r from public.console_actor();
    perform tests.check(r.is_super_admin and r.full_name = 's10' and r.organization_id is null,
        'a super admin: the grant, their name, no membership');

    perform tests.act_as(f.admin_a);
    select count(*) into n from public.console_actor();
    perform tests.check(n = 1, 'one row, about the caller');
    select * into r from public.console_actor();
    perform tests.check(
        not r.is_super_admin and r.organization_id = f.lab_a and r.organization_name = 'Actor Lab A'
        and r.member_role = 'org_admin' and r.member_status = 'active' and r.organization_status = 'active',
        'an org admin: their membership and organization');

    perform tests.act_as(f.admin_off);
    select * into r from public.console_actor();
    perform tests.check(r.member_status = 'deactivated', 'a deactivated membership reads as deactivated');

    perform tests.act_as(f.admin_b);
    select * into r from public.console_actor();
    perform tests.check(r.organization_status = 'deactivated', 'a deactivated organization reads as deactivated');

    perform tests.act_as(f.tech_a);
    select * into r from public.console_actor();
    perform tests.check(r.member_role = 'medtech' and not r.is_super_admin, 'a medtech reads as a medtech');

    perform tests.act_as(f.loner);
    select * into r from public.console_actor();
    perform tests.check(r.full_name = 'loner10' and r.organization_id is null and not r.is_super_admin,
        'someone in no organization: only their name');

    -- Revoking the grant shows on the very next call.
    perform tests.act_as_owner();
    update public.super_admins set revoked_at = now() where user_id = f.super_admin;
    perform tests.act_as(f.super_admin);
    select * into r from public.console_actor();
    perform tests.check(not r.is_super_admin, 'a revoked grant is gone on the next call');

    -- No caller, no row.
    perform tests.act_as_owner();
    perform set_config('request.jwt.claims', '', true);
    execute 'set local role anon';
    perform tests.expect_error('select * from public.console_actor()', '42501',
        'an anonymous client cannot call it');
end
$$;
