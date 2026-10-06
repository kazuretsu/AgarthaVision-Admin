-- admin/0007 · assigning a laboratory's patients to its medtechs.

create temporary table fx7 on commit drop as
select tests.create_user('s7@example.test', 'admin') as super_admin,
       tests.create_user('admin.a7@example.test')   as admin_a,
       tests.create_user('tech1.a7@example.test')   as tech_1,
       tests.create_user('tech2.a7@example.test')   as tech_2,
       tests.create_user('tech3.a7@example.test')   as tech_off,
       tests.create_user('admin.b7@example.test')   as admin_b,
       tests.create_user('tech.b7@example.test')    as tech_b,
       null::uuid as lab_a, null::uuid as lab_b,
       '70000000-0000-4000-8000-000000000001'::uuid as patient_a,
       '70000000-0000-4000-8000-000000000002'::uuid as patient_b;
grant select on fx7 to authenticated;

do $$
declare
    f   fx7;
    v_n integer;
    v_r record;
begin
    select * into f from fx7;
    perform tests.act_as(f.super_admin);
    f.lab_a := public.console_create_organization('Assign Lab A');
    f.lab_b := public.console_create_organization('Assign Lab B');
    perform tests.act_as_owner();
    insert into public.organization_members (user_id, organization_id, role, status) values
        (f.admin_a, f.lab_a, 'org_admin', 'active'), (f.tech_1, f.lab_a, 'medtech', 'active'),
        (f.tech_2, f.lab_a, 'medtech', 'active'), (f.tech_off, f.lab_a, 'medtech', 'deactivated'),
        (f.admin_b, f.lab_b, 'org_admin', 'active'), (f.tech_b, f.lab_b, 'medtech', 'active');

    -- Each patient is created by a medtech of its laboratory, which links them and files it.
    insert into public.patients (id, lastname, firstname, sex, birthdate, psgc_barangay_code, created_by)
    values (f.patient_a, 'Assign', 'Alpha', 'F', '2010-01-01', '0722217001', f.tech_1),
           (f.patient_b, 'Assign', 'Bravo', 'M', '2011-01-01', '0722217001', f.tech_b);
    perform tests.check(
        (select organization_id from public.patient_organizations where patient_id = f.patient_a) = f.lab_a,
        'setup: the patient belongs to the creator''s laboratory');

    -- ── Assigning ──
    perform tests.act_as(f.admin_a);
    perform public.console_assign_patient(f.patient_a, f.tech_2);
    perform public.console_assign_patient(f.patient_a, f.tech_2);
    perform tests.act_as_owner();
    perform tests.check(
        exists (select 1 from public.patient_users where patient_id = f.patient_a and user_id = f.tech_2),
        'an org admin assigns their patient to their medtech');
    perform tests.check(
        (select count(*) from public.admin_audit_log
          where action = 'assignment.add' and target_id = f.patient_a::text and organization_id = f.lab_a) = 1,
        'the assignment is audited once; repeating it changes nothing');
    perform tests.check(
        not exists (select 1 from public.admin_audit_log
                     where action like 'assignment.%' and details::text like '%Assign%'),
        'the audit entry never names the patient');

    -- The newly assigned medtech now sees the patient, as the app would.
    perform tests.act_as(f.tech_2);
    perform tests.check(
        exists (select 1 from public.patients where id = f.patient_a),
        'the assigned medtech can read the patient');

    perform tests.act_as(f.admin_a);
    perform tests.expect_error(
        format('select public.console_assign_patient(%L, %L)', f.patient_a, f.tech_b),
        '42501', 'a medtech of another laboratory cannot be assigned');
    perform tests.expect_error(
        format('select public.console_assign_patient(%L, %L)', f.patient_a, f.tech_off),
        '42501', 'a deactivated medtech cannot be assigned');
    -- Whether an org admin can be assigned is admin/0008's rule (they can); see its tests.
    perform tests.expect_error(
        format('select public.console_assign_patient(%L, %L)', f.patient_b, f.tech_1),
        '42501', 'another laboratory''s patient cannot be assigned');

    perform tests.act_as(f.super_admin);
    perform tests.expect_error(
        format('select public.console_assign_patient(%L, %L)', f.patient_a, f.tech_2),
        '42501', 'a super admin does not assign');
    perform tests.act_as(f.tech_1);
    perform tests.expect_error(
        format('select public.console_assign_patient(%L, %L)', f.patient_a, f.tech_2),
        '42501', 'a medtech does not assign');

    -- ── Reading ──
    perform tests.act_as(f.admin_a);
    select count(*) into v_n from public.console_patient_assignments(f.patient_a);
    perform tests.check(v_n = 2, 'an org admin reads who is linked to their patient');
    perform tests.expect_error(
        format('select * from public.console_patient_assignments(%L)', f.patient_b),
        '42501', 'but not to another laboratory''s patient');
    select * into v_r from public.console_member_patients(f.tech_2);
    perform tests.check(v_r.patient_id = f.patient_a and v_r.lastname = 'Assign',
        'an org admin reads a medtech''s patients, named');

    perform tests.act_as(f.super_admin);
    select * into v_r from public.console_member_patients(f.tech_2);
    perform tests.check(v_r.patient_id = f.patient_a and v_r.lastname is null and v_r.firstname is null,
        'a super admin reads a medtech''s patients de-identified');
    select count(*) into v_n from public.console_patient_assignments(f.patient_a);
    perform tests.check(v_n = 2, 'a super admin reads the links');

    perform tests.act_as(f.admin_b);
    perform tests.expect_error(
        format('select * from public.console_member_patients(%L)', f.tech_2),
        '42501', 'an org admin cannot read another laboratory''s medtech''s patients');

    -- ── Removing ──
    perform tests.act_as(f.admin_a);
    perform public.console_unassign_patient(f.patient_a, f.tech_1);
    perform tests.act_as_owner();
    perform tests.check(
        not exists (select 1 from public.patient_users where patient_id = f.patient_a and user_id = f.tech_1)
        and exists (select 1 from public.patients where id = f.patient_a and created_by = f.tech_1),
        'removing drops the link only; the patient and its author stay');
    perform tests.act_as(f.tech_1);
    perform tests.check(
        not exists (select 1 from public.patients where id = f.patient_a),
        'the unassigned medtech no longer reads the patient');

    perform tests.act_as(f.admin_a);
    perform tests.expect_error(
        format('select public.console_unassign_patient(%L, %L)', f.patient_a, f.tech_2),
        '23514', 'the last active medtech cannot be removed');
    perform tests.expect_error(
        format('select public.console_unassign_patient(%L, %L)', f.patient_a, f.tech_1),
        'P0002', 'removing a link that is not there says so');

    -- ── Replacing the last one ──
    perform public.console_replace_assignment(f.patient_a, f.tech_2, f.tech_1);
    perform tests.act_as_owner();
    perform tests.check(
        (select array_agg(user_id) from public.patient_users where patient_id = f.patient_a) = array[f.tech_1],
        'replacing hands the patient over in one step');
    perform tests.act_as(f.admin_a);
    perform tests.expect_error(
        format('select public.console_replace_assignment(%L, %L, %L)', f.patient_a, f.tech_1, f.tech_off),
        '42501', 'replacing with a deactivated medtech is refused, and nothing changes');
    perform tests.act_as_owner();
    perform tests.check(
        (select count(*) from public.patient_users where patient_id = f.patient_a and user_id = f.tech_1) = 1,
        'a refused replacement leaves the link');

    -- A deactivated medtech's link does not count as keeping the patient covered.
    insert into public.patient_users (patient_id, user_id) values (f.patient_a, f.tech_off);
    perform tests.act_as(f.admin_a);
    perform tests.expect_error(
        format('select public.console_unassign_patient(%L, %L)', f.patient_a, f.tech_1),
        '23514', 'only a deactivated medtech left counts as nobody');
    perform public.console_unassign_patient(f.patient_a, f.tech_off);

    -- ── Nothing writes the links directly ──
    perform tests.expect_error(
        format('insert into public.patient_users (patient_id, user_id) values (%L, %L)', f.patient_a, f.tech_2),
        '42501', 'an org admin cannot write a link directly');
end
$$;
