-- admin/0017 · offboarding medtechs: handing over open patients and deactivating.

create temporary table fx17 on commit drop as
select tests.create_user('s17@example.test', 'admin') as super_admin,
       tests.create_user('admin1.a17@example.test')   as admin_1,
       tests.create_user('tech1.a17@example.test')    as tech_1,
       tests.create_user('tech2.a17@example.test')    as tech_2,
       tests.create_user('admin.b17@example.test')    as admin_b,
       null::uuid as lab_a, null::uuid as lab_b,
       '90000000-0000-4000-8000-000000000017'::uuid as patient_1,
       '90000000-0000-4000-8000-000000000018'::uuid as patient_2;
grant select on fx17 to authenticated;

do $$
declare
    f fx17;
begin
    select * into f from fx17;
    perform tests.act_as(f.super_admin);
    f.lab_a := public.console_create_organization('Offboard Lab A');
    f.lab_b := public.console_create_organization('Offboard Lab B');
    perform tests.act_as_owner();
    insert into public.organization_members (user_id, organization_id, role) values
        (f.admin_1, f.lab_a, 'org_admin'),
        (f.tech_1, f.lab_a, 'medtech'),
        (f.tech_2, f.lab_a, 'medtech'),
        (f.admin_b, f.lab_b, 'org_admin');

    -- patient_1: tech_1 only (sole cover). patient_2: tech_1 and tech_2.
    insert into public.patients (id, lastname, firstname, sex, birthdate, psgc_barangay_code, created_by)
    values (f.patient_1, 'Offboard', 'One', 'F', '2010-01-01', '0722217001', f.tech_1),
           (f.patient_2, 'Offboard', 'Two', 'M', '2011-01-01', '0722217001', f.tech_1);
    insert into public.patient_users (patient_id, user_id) values (f.patient_2, f.tech_2);

    -- ── Permissions & Validations ──
    perform tests.act_as(f.tech_1);
    perform tests.expect_error(
        format('select public.console_offboard_member(%L, ''[]''::jsonb)', f.tech_1),
        '42501', 'a medtech cannot offboard themselves');
    perform tests.expect_error(
        format('select public.console_offboard_member(%L, ''[]''::jsonb)', f.tech_2),
        '42501', 'a medtech cannot offboard another medtech');

    perform tests.act_as(f.admin_1);
    perform tests.expect_error(
        format('select public.console_offboard_member(%L, ''[]''::jsonb)', f.admin_1),
        '42501', 'an org admin cannot offboard an org admin');

    perform tests.act_as(f.admin_b);
    perform tests.expect_error(
        format('select public.console_offboard_member(%L, ''[]''::jsonb)', f.tech_1),
        '42501', 'an org admin cannot offboard someone in another laboratory');

    -- ── Sole-cover enforcement ──
    -- Offboarding tech_1 without reassigning patient_1 must fail (sole cover left behind)
    perform tests.act_as(f.admin_1);
    perform tests.expect_error(
        format('select public.console_offboard_member(%L, ''[]''::jsonb)', f.tech_1),
        '23514', 'offboarding fails when sole-cover patients are not handed over');

    -- ── Successful offboarding with handover ──
    perform tests.act_as(f.admin_1);
    perform public.console_offboard_member(
        f.tech_1,
        jsonb_build_array(
            jsonb_build_object('patient_id', f.patient_1, 'to_user_id', f.tech_2)
        )
    );

    perform tests.act_as_owner();
    -- tech_1 is now deactivated
    perform tests.check(
        (select status from public.organization_members where user_id = f.tech_1) = 'deactivated',
        'offboarding marks the medtech deactivated');

    -- patient_1 is now assigned to tech_2 and no longer to tech_1
    perform tests.check(
        exists (select 1 from public.patient_users where patient_id = f.patient_1 and user_id = f.tech_2)
        and not exists (select 1 from public.patient_users where patient_id = f.patient_1 and user_id = f.tech_1),
        'patient_1 was handed over to tech_2');

    -- tech_1 authorship on patients is unchanged
    perform tests.check(
        (select created_by from public.patients where id = f.patient_1) = f.tech_1,
        'authorship on patient records is untouched');

    -- audit log contains member.offboard and assignment changes
    perform tests.check(
        exists (select 1 from public.admin_audit_log
                 where action = 'member.offboard' and target_id = f.tech_1::text
                   and (details->>'reassigned_patients')::int = 1),
        'audit trail records member.offboard with reassigned count');

    perform tests.check(
        exists (select 1 from public.admin_audit_log
                 where action = 'assignment.add' and target_id = f.patient_1::text
                   and details->>'member_id' = f.tech_2::text)
        and exists (select 1 from public.admin_audit_log
                     where action = 'assignment.remove' and target_id = f.patient_1::text
                       and details->>'member_id' = f.tech_1::text),
        'audit trail records assignment.add and assignment.remove for the handover');
end;
$$;
