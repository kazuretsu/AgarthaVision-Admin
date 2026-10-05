-- admin/0006 · a laboratory's people, and deactivating or reactivating its medtechs.

create temporary table fx6 on commit drop as
select tests.create_user('s6@example.test', 'admin') as super_admin,
       tests.create_user('admin.a6@example.test')   as admin_a,
       tests.create_user('admin2.a6@example.test')  as admin_a2,
       tests.create_user('tech.a6@example.test')    as medtech_a,
       tests.create_user('tech.b6@example.test')    as medtech_b,
       tests.create_user('admin.b6@example.test')   as admin_b,
       null::uuid as lab_a, null::uuid as lab_b;
grant select on fx6 to authenticated;

do $$
declare
    f   fx6;
    v_n integer;
    v_p record;
begin
    select * into f from fx6;
    perform tests.act_as(f.super_admin);
    f.lab_a := public.console_create_organization('People Lab A');
    f.lab_b := public.console_create_organization('People Lab B');
    perform tests.act_as_owner();
    insert into public.organization_members (user_id, organization_id, role) values
        (f.admin_a, f.lab_a, 'org_admin'), (f.admin_a2, f.lab_a, 'org_admin'),
        (f.medtech_a, f.lab_a, 'medtech'),
        (f.admin_b, f.lab_b, 'org_admin'), (f.medtech_b, f.lab_b, 'medtech');

    -- Two of Lab A's patients, linked to its medtech; one of Lab B's, linked to theirs.
    insert into public.patients (id, lastname, firstname, sex, birthdate, psgc_barangay_code, created_by)
    values ('60000000-0000-4000-8000-000000000001', 'People', 'One', 'F', '2010-01-01', '0722217001', f.medtech_a),
           ('60000000-0000-4000-8000-000000000002', 'People', 'Two', 'M', '2011-01-01', '0722217001', f.medtech_a),
           ('60000000-0000-4000-8000-000000000003', 'People', 'Three', 'M', '2012-01-01', '0722217001', f.medtech_b);

    -- ── Reading the people ──
    perform tests.act_as(f.admin_a);
    select count(*) into v_n from public.console_organization_people(f.lab_a);
    perform tests.check(v_n = 3, 'an org admin reads their laboratory''s people');
    select * into v_p from public.console_organization_people(f.lab_a) where user_id = f.medtech_a;
    perform tests.check(v_p.email = 'tech.a6@example.test', 'each person comes with their email');
    perform tests.check(v_p.assigned_patients = 2, 'and the number of the laboratory''s patients linked to them');
    perform tests.expect_error(
        format('select * from public.console_organization_people(%L)', f.lab_b),
        '42501', 'an org admin cannot read another laboratory''s people');

    perform tests.act_as(f.medtech_a);
    perform tests.expect_error(
        format('select * from public.console_organization_people(%L)', f.lab_a),
        '42501', 'a medtech cannot read the people list');

    perform tests.act_as(f.super_admin);
    select count(*) into v_n from public.console_organization_people(f.lab_b);
    perform tests.check(v_n = 2, 'a super admin reads any laboratory''s people');

    -- ── Who may be deactivated, and by whom ──
    perform tests.act_as(f.admin_a);
    perform tests.expect_error(
        format('select public.console_set_member_status(%L, ''deactivated'')', f.admin_a),
        '42501', 'an org admin cannot deactivate themselves');
    perform tests.expect_error(
        format('select public.console_set_member_status(%L, ''deactivated'')', f.admin_a2),
        '42501', 'an org admin cannot deactivate another org admin');
    perform tests.expect_error(
        format('select public.console_set_member_status(%L, ''deactivated'')', f.medtech_b),
        '42501', 'an org admin cannot deactivate another laboratory''s medtech');
    perform tests.expect_error(
        format('select public.console_set_member_status(%L, ''gone'')', f.medtech_a),
        '22023', 'an unknown status is refused');

    perform public.console_set_member_status(f.medtech_a, 'deactivated');
    perform public.console_set_member_status(f.medtech_a, 'deactivated');
    perform tests.act_as_owner();
    perform tests.check(
        (select status from public.organization_members where user_id = f.medtech_a) = 'deactivated',
        'an org admin deactivates their medtech');
    perform tests.check(
        (select count(*) from public.admin_audit_log
          where action = 'member.deactivate' and target_id = f.medtech_a::text
            and actor_id = f.admin_a and organization_id = f.lab_a) = 1,
        'the deactivation is audited once; repeating it changes nothing');
    perform tests.check(
        (select count(*) from public.patient_users where user_id = f.medtech_a) = 2
        and exists (select 1 from public.profiles where id = f.medtech_a),
        'deactivating deletes nothing: the profile and the patient links stay');

    perform tests.act_as(f.medtech_a);
    perform tests.expect_error(
        format('select public.console_set_member_status(%L, ''active'')', f.medtech_a),
        '42501', 'a medtech cannot reactivate themselves');

    perform tests.act_as(f.super_admin);
    perform public.console_set_member_status(f.medtech_a, 'active');
    perform tests.act_as_owner();
    perform tests.check(
        (select status from public.organization_members where user_id = f.medtech_a) = 'active'
        and exists (select 1 from public.admin_audit_log
                     where action = 'member.reactivate' and actor_id = f.super_admin),
        'a super admin reactivates, and it is audited');

    -- ── Nothing writes memberships directly ──
    perform tests.act_as(f.admin_a);
    perform tests.expect_error(
        'update public.organization_members set status = ''deactivated''', '42501',
        'an org admin cannot write a membership directly');
end
$$;
