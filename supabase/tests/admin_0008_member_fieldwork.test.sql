-- admin/0008 · any active member of a laboratory, org admins included, does fieldwork.

create temporary table fx8 on commit drop as
select tests.create_user('s8@example.test', 'admin')   as super_admin,
       tests.create_user('admin1.a8@example.test')     as admin_a,
       tests.create_user('admin2.a8@example.test')     as admin_a2,
       tests.create_user('admin3.a8@example.test')     as admin_off,
       tests.create_user('tech.a8@example.test')       as tech_a,
       tests.create_user('admin.b8@example.test')      as admin_b,
       null::uuid as lab_a, null::uuid as lab_b,
       '80000000-0000-4000-8000-000000000001'::uuid as patient_1,
       '80000000-0000-4000-8000-000000000002'::uuid as patient_2;
grant select on fx8 to authenticated;

do $$
declare
    f fx8;
    v_details jsonb;
begin
    select * into f from fx8;
    perform tests.act_as(f.super_admin);
    f.lab_a := public.console_create_organization('Fieldwork Lab A');
    f.lab_b := public.console_create_organization('Fieldwork Lab B');
    perform tests.act_as_owner();
    insert into public.organization_members (user_id, organization_id, role, status) values
        (f.admin_a, f.lab_a, 'org_admin', 'active'), (f.admin_a2, f.lab_a, 'org_admin', 'active'),
        (f.admin_off, f.lab_a, 'org_admin', 'deactivated'), (f.tech_a, f.lab_a, 'medtech', 'active'),
        (f.admin_b, f.lab_b, 'org_admin', 'active');

    -- An org admin registers a patient in the app, as a medtech would: linked and filed.
    insert into public.patients (id, lastname, firstname, sex, birthdate, psgc_barangay_code, created_by)
    values (f.patient_1, 'Field', 'One', 'F', '2012-01-01', '0722217001', f.admin_a),
           (f.patient_2, 'Field', 'Two', 'M', '2013-01-01', '0722217001', f.tech_a);
    perform tests.check(
        (select organization_id from public.patient_organizations where patient_id = f.patient_1) = f.lab_a
        and exists (select 1 from public.patient_users where patient_id = f.patient_1 and user_id = f.admin_a),
        'setup: a patient an org admin registers is theirs and their laboratory''s');

    -- ── Assigning an org admin ──
    perform tests.act_as(f.admin_a);
    perform public.console_assign_patient(f.patient_2, f.admin_a2);
    perform public.console_assign_patient(f.patient_2, f.admin_a);
    perform tests.act_as_owner();
    perform tests.check(
        (select count(*) from public.patient_users
          where patient_id = f.patient_2 and user_id in (f.admin_a, f.admin_a2)) = 2,
        'an org admin assigns another org admin of the laboratory, and themselves');
    select details into v_details from public.admin_audit_log
     where action = 'assignment.add' and target_id = f.patient_2::text
       and details->>'member_id' = f.admin_a2::text;
    perform tests.check(
        v_details->>'member' = 'admin2.a8' and v_details->>'role' = 'org_admin'
        and v_details::text not like '%Field%',
        'the audit entry names the member and their role, never the patient');

    perform tests.act_as(f.admin_a2);
    perform tests.check(
        exists (select 1 from public.patients where id = f.patient_2),
        'the assigned org admin reads the patient, as the app would');

    perform tests.act_as(f.admin_a);
    perform tests.expect_error(
        format('select public.console_assign_patient(%L, %L)', f.patient_1, f.admin_off),
        '42501', 'a deactivated org admin cannot be assigned');
    perform tests.expect_error(
        format('select public.console_assign_patient(%L, %L)', f.patient_1, f.admin_b),
        '42501', 'an org admin of another laboratory cannot be assigned');
    perform tests.expect_error(
        format('select public.console_assign_patient(%L, %L)', f.patient_1, f.super_admin),
        '42501', 'a super admin, a member of no laboratory, cannot be assigned');

    -- ── Cover ──
    -- patient_2: tech_a (creator), admin_a2, admin_a. An active org admin keeps it covered.
    perform public.console_unassign_patient(f.patient_2, f.tech_a);
    perform public.console_unassign_patient(f.patient_2, f.admin_a);
    perform tests.act_as_owner();
    perform tests.check(
        (select array_agg(user_id) from public.patient_users where patient_id = f.patient_2) = array[f.admin_a2],
        'a patient linked to an active org admin can lose its medtech');
    select details into v_details from public.admin_audit_log
     where action = 'assignment.remove' and target_id = f.patient_2::text
       and details->>'member_id' = f.tech_a::text;
    perform tests.check(v_details->>'role' = 'medtech', 'a removal records the member''s role');

    perform tests.act_as(f.admin_a);
    perform tests.expect_error(
        format('select public.console_unassign_patient(%L, %L)', f.patient_2, f.admin_a2),
        '23514', 'the last active member, an org admin, cannot be removed');

    -- A deactivated org admin's link is not cover.
    perform tests.act_as_owner();
    insert into public.patient_users (patient_id, user_id) values (f.patient_2, f.admin_off);
    perform tests.act_as(f.admin_a);
    perform tests.expect_error(
        format('select public.console_unassign_patient(%L, %L)', f.patient_2, f.admin_a2),
        '23514', 'only a deactivated org admin left counts as nobody');
    perform public.console_unassign_patient(f.patient_2, f.admin_off);

    -- ── Handing over between roles ──
    perform public.console_replace_assignment(f.patient_2, f.admin_a2, f.tech_a);
    perform public.console_replace_assignment(f.patient_1, f.admin_a, f.admin_a2);
    perform tests.act_as_owner();
    perform tests.check(
        (select array_agg(user_id) from public.patient_users where patient_id = f.patient_2) = array[f.tech_a]
        and (select array_agg(user_id) from public.patient_users where patient_id = f.patient_1) = array[f.admin_a2],
        'a patient is handed from an org admin to a medtech, and between org admins');

    -- ── Who assigns is unchanged ──
    perform tests.act_as(f.tech_a);
    perform tests.expect_error(
        format('select public.console_assign_patient(%L, %L)', f.patient_1, f.tech_a),
        '42501', 'a medtech still does not assign');
    perform tests.act_as(f.super_admin);
    perform tests.expect_error(
        format('select public.console_assign_patient(%L, %L)', f.patient_1, f.admin_a),
        '42501', 'a super admin still does not assign');
    perform tests.act_as(f.admin_b);
    perform tests.expect_error(
        format('select public.console_unassign_patient(%L, %L)', f.patient_1, f.admin_a2),
        '42501', 'an org admin still cannot touch another laboratory''s patient');
end
$$;
