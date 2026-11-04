-- admin/0023 · Sharing a patient with another laboratory (referral)

create temporary table fx23 on commit drop as
select tests.create_user('s23@example.test', 'admin') as super_admin,
       tests.create_user('admin.a23@example.test')   as admin_a,
       tests.create_user('tech.a23@example.test')    as tech_a,
       tests.create_user('admin.b23@example.test')   as admin_b,
       tests.create_user('tech.b23@example.test')    as tech_b,
       tests.create_user('admin.c23@example.test')   as admin_c,
       null::uuid as lab_a, null::uuid as lab_b, null::uuid as lab_c,
       '23000000-0000-4000-8000-000000000001'::uuid as patient_a;
grant select on fx23 to authenticated;

do $$
declare
    f           fx23;
    v_share_id  uuid;
    v_count     integer;
begin
    select * into f from fx23;

    -- Setup laboratories
    perform tests.act_as(f.super_admin);
    f.lab_a := public.console_create_organization('Share Lab A');
    f.lab_b := public.console_create_organization('Share Lab B');
    f.lab_c := public.console_create_organization('Share Lab C');

    perform tests.act_as_owner();
    insert into public.organization_members (user_id, organization_id, role, status) values
        (f.admin_a, f.lab_a, 'org_admin', 'active'),
        (f.tech_a,  f.lab_a, 'medtech',   'active'),
        (f.admin_b, f.lab_b, 'org_admin', 'active'),
        (f.tech_b,  f.lab_b, 'medtech',   'active'),
        (f.admin_c, f.lab_c, 'org_admin', 'active');

    -- Patient registered by tech_a in Lab A
    insert into public.patients (id, lastname, firstname, sex, birthdate, psgc_barangay_code, created_by)
    values (f.patient_a, 'Referral', 'Patient', 'F', '2000-01-01', '0722217001', f.tech_a);

    perform tests.check(
        (select organization_id from public.patient_organizations where patient_id = f.patient_a) = f.lab_a,
        'setup: patient belongs to Lab A');

    -- ── 1. Before sharing: Lab B and Lab C cannot see the patient ──
    perform tests.act_as(f.admin_b);
    perform tests.check(
        not exists (select 1 from public.patients where id = f.patient_a),
        'before share: Lab B admin cannot see patient');
    perform tests.expect_error(
        format('select public.console_assign_patient(%L, %L)', f.patient_a, f.tech_b),
        '42501', 'before share: Lab B admin cannot assign medtech to patient');
    perform tests.expect_error(
        format('select public.console_share_patient(%L, %L, %L)', f.patient_a, f.lab_c, 'Unpermitted'),
        '42501', 'receiving org admin cannot share someone else''s patient');

    -- ── 2. Lab A admin shares patient with Lab B ──
    perform tests.act_as(f.admin_a);

    -- Reason is required
    perform tests.expect_error(
        format('select public.console_share_patient(%L, %L, %L)', f.patient_a, f.lab_b, '   '),
        '23514', 'share reason cannot be blank');

    -- Cannot share with self
    perform tests.expect_error(
        format('select public.console_share_patient(%L, %L, %L)', f.patient_a, f.lab_a, 'Self referral'),
        '22023', 'cannot share with owning lab');

    -- Successful share
    v_share_id := public.console_share_patient(f.patient_a, f.lab_b, 'Second opinion on smear');
    perform tests.check(v_share_id is not null, 'share created');

    -- Duplicate active share refused
    perform tests.expect_error(
        format('select public.console_share_patient(%L, %L, %L)', f.patient_a, f.lab_b, 'Duplicate'),
        '23505', 'cannot create duplicate active share to same organization');

    -- Audited
    perform tests.act_as_owner();
    perform tests.check(
        exists (select 1 from public.admin_audit_log
                where action = 'patient.share' and target_id = f.patient_a::text
                  and organization_id = f.lab_a
                  and details->>'target_organization_name' = 'Share Lab B'
                  and details->>'reason' = 'Second opinion on smear'),
        'share is audited with target lab and reason');

    -- ── 3. After sharing: Lab B admin can see and assign ──
    perform tests.act_as(f.admin_b);
    perform tests.check(
        exists (select 1 from public.patients where id = f.patient_a),
        'after share: Lab B admin can see patient');

    -- Lab B admin assigns tech_b
    perform public.console_assign_patient(f.patient_a, f.tech_b);
    perform tests.act_as_owner();
    perform tests.check(
        exists (select 1 from public.patient_users where patient_id = f.patient_a and user_id = f.tech_b),
        'after share: Lab B medtech is assigned');
    perform tests.check(
        exists (select 1 from public.admin_audit_log
                where action = 'assignment.add' and target_id = f.patient_a::text and organization_id = f.lab_b),
        'assignment by Lab B is audited under Lab B');

    -- Lab B tech can see patient
    perform tests.act_as(f.tech_b);
    perform tests.check(
        exists (select 1 from public.patients where id = f.patient_a),
        'after share: Lab B medtech can read patient');

    -- Lab C still cannot see patient
    perform tests.act_as(f.admin_c);
    perform tests.check(
        not exists (select 1 from public.patients where id = f.patient_a),
        'unshared Lab C cannot see patient');

    -- Lab B admin cannot revoke the share
    perform tests.act_as(f.admin_b);
    perform tests.expect_error(
        format('select public.console_revoke_patient_share(%L, %L)', v_share_id, 'Revoke attempt'),
        '42501', 'receiving org admin cannot revoke share');

    -- ── 4. Lab A admin revokes share ──
    perform tests.act_as(f.admin_a);

    -- Reason is required
    perform tests.expect_error(
        format('select public.console_revoke_patient_share(%L, %L)', v_share_id, '   '),
        '23514', 'revoke reason cannot be blank');

    perform public.console_revoke_patient_share(v_share_id, 'Referral concluded');

    -- Audited
    perform tests.act_as_owner();
    perform tests.check(
        exists (select 1 from public.admin_audit_log
                where action = 'patient.share_revoke' and target_id = f.patient_a::text
                  and organization_id = f.lab_a
                  and details->>'reason' = 'Referral concluded'),
        'share revocation is audited with reason');

    -- ── 5. After revoking: Lab B admin loses access immediately ──
    perform tests.act_as(f.admin_b);
    perform tests.check(
        not exists (select 1 from public.patients where id = f.patient_a),
        'after revocation: Lab B admin can no longer see patient');
    perform tests.expect_error(
        format('select public.console_assign_patient(%L, %L)', f.patient_a, f.tech_b),
        '42501', 'after revocation: Lab B admin cannot assign medtech to patient');

    -- Nothing is deleted: share record still exists with revoked_at
    perform tests.act_as_owner();
    perform tests.check(
        (select revoked_at from public.patient_shares where id = v_share_id) is not null,
        'share row preserved with revoked_at set');
    perform tests.check(
        (select organization_id from public.patient_organizations where patient_id = f.patient_a) = f.lab_a,
        'patient ownership never changed');
end;
$$;

