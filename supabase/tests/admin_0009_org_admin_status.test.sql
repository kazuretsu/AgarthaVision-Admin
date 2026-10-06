-- admin/0009 · deactivating org admins; never the last one, never a patient's only cover.

create temporary table fx9 on commit drop as
select tests.create_user('s9@example.test', 'admin')  as super_admin,
       tests.create_user('admin1.a9@example.test')    as admin_1,
       tests.create_user('admin2.a9@example.test')    as admin_2,
       tests.create_user('tech1.a9@example.test')     as tech_1,
       tests.create_user('tech2.a9@example.test')     as tech_2,
       tests.create_user('admin.b9@example.test')     as admin_b,
       null::uuid as lab_a, null::uuid as lab_b,
       '90000000-0000-4000-8000-000000000001'::uuid as patient_1,
       '90000000-0000-4000-8000-000000000002'::uuid as patient_2;
grant select on fx9 to authenticated;

do $$
declare
    f     fx9;
    v_ids uuid[];
begin
    select * into f from fx9;
    perform tests.act_as(f.super_admin);
    f.lab_a := public.console_create_organization('Status Lab A');
    f.lab_b := public.console_create_organization('Status Lab B');
    perform tests.act_as_owner();
    insert into public.organization_members (user_id, organization_id, role) values
        (f.admin_1, f.lab_a, 'org_admin'), (f.admin_2, f.lab_a, 'org_admin'),
        (f.tech_1, f.lab_a, 'medtech'), (f.tech_2, f.lab_a, 'medtech'),
        (f.admin_b, f.lab_b, 'org_admin');

    -- patient_1: tech_1 only. patient_2: admin_2 and tech_2.
    insert into public.patients (id, lastname, firstname, sex, birthdate, psgc_barangay_code, created_by)
    values (f.patient_1, 'Status', 'One', 'F', '2010-01-01', '0722217001', f.tech_1),
           (f.patient_2, 'Status', 'Two', 'M', '2011-01-01', '0722217001', f.admin_2);
    insert into public.patient_users (patient_id, user_id) values (f.patient_2, f.tech_2);

    -- ── Who may change an org admin ──
    perform tests.act_as(f.admin_1);
    perform tests.expect_error(
        format('select public.console_set_member_status(%L, ''deactivated'')', f.admin_2),
        '42501', 'an org admin cannot deactivate a fellow org admin');
    perform tests.expect_error(
        format('select public.console_set_member_status(%L, ''deactivated'')', f.admin_1),
        '42501', 'nor themselves');
    perform tests.act_as(f.tech_1);
    perform tests.expect_error(
        format('select public.console_set_member_status(%L, ''deactivated'')', f.admin_1),
        '42501', 'a medtech cannot deactivate anyone');

    -- ── A super admin deactivates an org admin, deleting nothing ──
    perform tests.act_as(f.super_admin);
    perform public.console_set_member_status(f.admin_2, 'deactivated');
    perform tests.act_as_owner();
    perform tests.check(
        (select status from public.organization_members where user_id = f.admin_2) = 'deactivated'
        and exists (select 1 from public.patient_users where patient_id = f.patient_2 and user_id = f.admin_2),
        'a super admin deactivates an org admin; their membership and patient links stay');
    perform tests.check(
        (select details->>'role' from public.admin_audit_log
          where action = 'member.deactivate' and target_id = f.admin_2::text) = 'org_admin',
        'the deactivation is audited with the role');
    perform tests.check(public.console_org_admin_org(f.admin_2) is null,
        'a deactivated org admin is no longer an org admin to any check');

    -- ── The last active org admin ──
    perform tests.act_as(f.super_admin);
    perform tests.expect_error(
        format('select public.console_set_member_status(%L, ''deactivated'')', f.admin_1),
        '23514', 'the laboratory''s last active org admin cannot be deactivated');
    perform tests.act_as_owner();
    perform tests.check(
        (select status from public.organization_members where user_id = f.admin_1) = 'active',
        'a refused deactivation changes nothing');

    perform tests.act_as(f.super_admin);
    perform public.console_set_member_status(f.admin_2, 'active');
    perform tests.act_as_owner();
    perform tests.check(
        (select status from public.organization_members where user_id = f.admin_2) = 'active'
        and exists (select 1 from public.admin_audit_log
                     where action = 'member.reactivate' and target_id = f.admin_2::text),
        'a super admin reactivates an org admin, audited');
    perform tests.act_as(f.admin_1);
    perform tests.expect_error(
        format('select public.console_set_member_status(%L, ''active'')', f.admin_2),
        '42501', 'an org admin cannot reactivate an org admin either');

    -- ── A patient's only active member ──
    perform tests.act_as(f.admin_1);
    select array_agg(patient_id) into v_ids from public.console_member_sole_cover(f.tech_1);
    perform tests.check(v_ids = array[f.patient_1], 'the console reads which patients only this member covers');
    select array_agg(patient_id) into v_ids from public.console_member_sole_cover(f.tech_2);
    perform tests.check(v_ids is null, 'a member who shares every patient covers none alone');
    perform tests.expect_error(
        format('select public.console_set_member_status(%L, ''deactivated'')', f.tech_1),
        '23514', 'a medtech who is a patient''s only active member cannot be deactivated');

    -- An org admin's link counts as cover: tech_2 shares patient_2 with admin_2.
    perform public.console_set_member_status(f.tech_2, 'deactivated');
    perform tests.act_as(f.super_admin);
    perform tests.expect_error(
        format('select public.console_set_member_status(%L, ''deactivated'')', f.admin_2),
        '23514', 'an org admin who is now a patient''s only active member cannot be deactivated');

    -- Handing the patient over first makes the deactivation possible.
    perform tests.act_as(f.admin_1);
    perform public.console_replace_assignment(f.patient_1, f.tech_1, f.admin_1);
    perform public.console_set_member_status(f.tech_1, 'deactivated');
    perform tests.act_as_owner();
    perform tests.check(
        (select status from public.organization_members where user_id = f.tech_1) = 'deactivated',
        'after handing over, the medtech is deactivated');

    -- Reactivating is never refused for cover or for org admins.
    perform tests.act_as(f.admin_1);
    perform public.console_set_member_status(f.tech_1, 'active');

    -- ── Reading cover is scoped like the rest ──
    perform tests.act_as(f.admin_b);
    perform tests.expect_error(
        format('select * from public.console_member_sole_cover(%L)', f.tech_1),
        '42501', 'an org admin cannot read another laboratory''s member''s cover');
    perform tests.act_as(f.super_admin);
    select array_agg(patient_id) into v_ids from public.console_member_sole_cover(f.admin_1);
    perform tests.check(v_ids = array[f.patient_1], 'a super admin reads it, as patient ids only');
    perform tests.act_as(f.tech_2);
    perform tests.expect_error(
        format('select public.console_sole_cover_patient_ids(%L, %L)', f.tech_1, f.lab_a),
        '42501', 'the helper is not callable by clients');
end
$$;
