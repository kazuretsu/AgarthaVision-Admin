-- admin/0004 · An org admin reads their organization's patient reports (app 0015).
--
-- Needs an app checkout with 0015_patient_reports.sql: admin/0004 itself refuses to apply
-- without it, so reaching this file means the column exists.

create temporary table fx4 (
    super_admin uuid, lab_a uuid, lab_b uuid,
    admin_a uuid, medtech_a uuid, colleague_a uuid, admin_b uuid, medtech_b uuid,
    patient_a uuid, patient_b uuid, session_a uuid, session_b uuid,
    session_report_a uuid, session_report_b uuid, patient_report_a uuid, patient_report_b uuid
) on commit drop;
grant select on fx4 to authenticated;

do $$
declare
    f fx4;
begin
    f.super_admin := tests.create_user('s4@example.test', 'admin');
    f.admin_a     := tests.create_user('admin.a4@example.test');
    f.medtech_a   := tests.create_user('tech.a4@example.test');
    f.colleague_a := tests.create_user('colleague.a4@example.test');
    f.admin_b     := tests.create_user('admin.b4@example.test');
    f.medtech_b   := tests.create_user('tech.b4@example.test');

    perform tests.act_as(f.super_admin);
    f.lab_a := public.console_create_organization('Reports Lab A');
    f.lab_b := public.console_create_organization('Reports Lab B');

    perform tests.act_as_owner();
    insert into public.organization_members (user_id, organization_id, role) values
        (f.admin_a, f.lab_a, 'org_admin'), (f.medtech_a, f.lab_a, 'medtech'),
        (f.colleague_a, f.lab_a, 'medtech'),
        (f.admin_b, f.lab_b, 'org_admin'), (f.medtech_b, f.lab_b, 'medtech');

    -- Patients registered through the app's path, so admin/0002's trigger files them.
    perform tests.act_as(f.medtech_a);
    insert into public.patients (lastname, firstname, sex, birthdate, psgc_barangay_code, created_by)
    values ('Report', 'Alpha', 'F', '2012-01-01', '0722217001', f.medtech_a);
    perform tests.act_as(f.medtech_b);
    insert into public.patients (lastname, firstname, sex, birthdate, psgc_barangay_code, created_by)
    values ('Report', 'Bravo', 'M', '2013-01-01', '0722217002', f.medtech_b);

    perform tests.act_as_owner();
    select id into f.patient_a from public.patients where lastname = 'Report' and firstname = 'Alpha';
    select id into f.patient_b from public.patients where lastname = 'Report' and firstname = 'Bravo';

    insert into public.sessions (user_id, patient_id, device_id) values (f.medtech_a, f.patient_a, 'd')
        returning id into f.session_a;
    insert into public.sessions (user_id, patient_id, device_id) values (f.medtech_b, f.patient_b, 'd')
        returning id into f.session_b;

    -- One session report and one patient report per laboratory, in 0015's two shapes.
    insert into public.reports (report_type, session_id, user_id, total_samples, total_eggs_confirmed)
        values ('session', f.session_a, f.medtech_a, 1, 1) returning id into f.session_report_a;
    insert into public.reports (report_type, session_id, user_id, total_samples, total_eggs_confirmed)
        values ('session', f.session_b, f.medtech_b, 1, 1) returning id into f.session_report_b;
    insert into public.reports
        (report_type, patient_id, session_ids, user_id, total_samples, total_eggs_confirmed)
        values ('patient', f.patient_a, array[f.session_a], f.medtech_a, 1, 1)
        returning id into f.patient_report_a;
    insert into public.reports
        (report_type, patient_id, session_ids, user_id, total_samples, total_eggs_confirmed)
        values ('patient', f.patient_b, array[f.session_b], f.medtech_b, 1, 1)
        returning id into f.patient_report_b;

    insert into fx4 select f.*;
end
$$;

-- ── Patient reports: the owning laboratory reads them, no other ──────────────
do $$
declare
    f fx4;
begin
    select * into f from fx4;

    perform tests.act_as(f.admin_a);
    perform tests.check(exists (select 1 from public.reports where id = f.patient_report_a),
        'an org admin reads a patient report on their own laboratory''s patient');
    perform tests.check(not exists (select 1 from public.reports where id = f.patient_report_b),
        'an org admin cannot read a patient report on another laboratory''s patient');

    perform tests.act_as(f.admin_b);
    perform tests.check(exists (select 1 from public.reports where id = f.patient_report_b),
        'the other laboratory''s org admin reads their own patient report');
    perform tests.check(not exists (select 1 from public.reports where id = f.patient_report_a),
        'and not Lab A''s');
end
$$;

-- ── Session reports: exactly as before ───────────────────────────────────────
do $$
declare
    f fx4;
begin
    select * into f from fx4;

    perform tests.act_as(f.admin_a);
    perform tests.check(exists (select 1 from public.reports where id = f.session_report_a),
        'an org admin still reads their laboratory''s session reports');
    perform tests.check(not exists (select 1 from public.reports where id = f.session_report_b),
        'and still not another laboratory''s');
    perform tests.check(
        (select count(*) from public.reports
         where id in (f.session_report_a, f.session_report_b, f.patient_report_a, f.patient_report_b)) = 2,
        'an org admin sees exactly their laboratory''s two reports');

    perform tests.act_as(f.super_admin);
    perform tests.check(
        (select count(*) from public.reports
         where id in (f.session_report_a, f.session_report_b, f.patient_report_a, f.patient_report_b)) = 4,
        'a super admin''s report rows are unchanged: every one, through the app''s own policy');
end
$$;

-- ── Nobody else gains anything ───────────────────────────────────────────────
do $$
declare
    f fx4;
begin
    select * into f from fx4;

    perform tests.act_as(f.medtech_a);
    perform tests.check(exists (select 1 from public.reports where id = f.patient_report_a),
        'the author still reads their own patient report');

    -- A medtech of the same laboratory is not an org admin: 0004 opens nothing to them,
    -- and the app keeps a patient report to its author (0015).
    perform tests.act_as(f.colleague_a);
    perform tests.check(not exists (select 1 from public.reports where id = f.patient_report_a),
        'a colleague medtech in the same laboratory cannot read the patient report');

    -- A signed-out visitor: 0004's policy is for `authenticated` only.
    perform tests.act_as_owner();
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    execute 'set local role anon';
    perform tests.check(
        not exists (select 1 from public.reports where id in (f.patient_report_a, f.patient_report_b)),
        'a signed-out visitor reads no patient report');

    -- A deactivated laboratory's org admin is no longer one.
    perform tests.act_as_owner();
    update public.organizations set status = 'deactivated', deactivated_at = now() where id = f.lab_a;
    perform tests.act_as(f.admin_a);
    perform tests.check(not exists (select 1 from public.reports where id = f.patient_report_a),
        'a deactivated laboratory''s org admin loses its patient reports');
end
$$;
