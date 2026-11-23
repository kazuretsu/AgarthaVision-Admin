-- admin/0025 · Anyone holding a report's QR link can check it, and learns nothing else.

create temporary table fx25 (
    super_admin uuid, lab uuid, medtech uuid, patient uuid, session uuid,
    session_report uuid, patient_report uuid, ts bigint
) on commit drop;
grant select on fx25 to anon, authenticated;

do $$
declare
    f fx25;
begin
    f.super_admin := tests.create_user('s25@example.test', 'admin');
    f.medtech     := tests.create_user('tech25@example.test');

    perform tests.act_as(f.super_admin);
    f.lab := public.console_create_organization('Report Check Lab');

    perform tests.act_as_owner();
    insert into public.organization_members (user_id, organization_id, role)
    values (f.medtech, f.lab, 'medtech');

    -- Registered through the app's path, so admin/0002's trigger files the patient.
    perform tests.act_as(f.medtech);
    insert into public.patients (lastname, firstname, sex, birthdate, psgc_barangay_code, created_by)
    values ('Check', 'Alpha', 'F', '2012-01-01', '0722217001', f.medtech);

    perform tests.act_as_owner();
    select id into f.patient from public.patients where lastname = 'Check' and firstname = 'Alpha';
    insert into public.sessions (user_id, patient_id, device_id) values (f.medtech, f.patient, 'd')
        returning id into f.session;

    insert into public.reports (report_type, session_id, user_id, generated_at, total_samples,
                                total_eggs_confirmed, positive_species, lpf_per_species)
    values ('session', f.session, f.medtech, '2026-11-22 14:05:05.678+00', 10, 7,
            array['Ascaris lumbricoides'],
            '{"Ascaris lumbricoides": {"min": 0, "max": 4}}'::jsonb)
    returning id into f.session_report;
    insert into public.reports (report_type, patient_id, session_ids, user_id, generated_at,
                                total_samples, total_eggs_confirmed)
    values ('patient', f.patient, array[f.session], f.medtech, '2026-11-22 14:05:05.678+00', 10, 0)
    returning id into f.patient_report;

    -- The app writes the instant's epoch second into the link.
    f.ts := 1795356305;
    insert into fx25 select f.*;
end;
$$;

-- A signed-out visitor: the doctor holding the paper.
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
set local role anon;

do $$
declare
    f fx25;
    r record;
begin
    select * into f from fx25;

    select * into r from public.console_check_report(f.session_report, f.session, null, f.ts);
    perform tests.check(r.outcome = 'confirmed', 'a matching session report link is confirmed');
    perform tests.check(r.report_type = 'session', 'it says which kind of report');
    perform tests.check(r.laboratory_name = 'Report Check Lab', 'it names the patient''s laboratory');
    perform tests.check(r.total_samples = 10 and r.total_eggs_confirmed = 7, 'it returns the totals');
    perform tests.check(r.positive_species = array['Ascaris lumbricoides'], 'it returns the positive species');
    perform tests.check((r.lpf_per_species -> 'Ascaris lumbricoides' ->> 'max')::int = 4,
        'it returns the stored LPF ranges');

    select * into r from public.console_check_report(f.patient_report, null, f.patient, f.ts);
    perform tests.check(r.outcome = 'confirmed' and r.report_type = 'patient'
        and r.laboratory_name = 'Report Check Lab', 'a matching patient report link is confirmed');

    -- Altered links: the id exists, nothing else is given away.
    select * into r from public.console_check_report(f.session_report, f.session, null, f.ts + 1);
    perform tests.check(r.outcome = 'mismatch' and r.report_type is null and r.lpf_per_species is null
        and r.laboratory_name is null and r.generated_at is null,
        'a wrong timestamp is a mismatch that returns no findings');
    select * into r from public.console_check_report(f.session_report, gen_random_uuid(), null, f.ts);
    perform tests.check(r.outcome = 'mismatch', 'another session''s id is a mismatch');
    select * into r from public.console_check_report(f.session_report, null, f.patient, f.ts);
    perform tests.check(r.outcome = 'mismatch', 'a session report checked as a patient report is a mismatch');
    select * into r from public.console_check_report(f.patient_report, f.session, null, f.ts);
    perform tests.check(r.outcome = 'mismatch', 'a patient report checked as a session report is a mismatch');
    select * into r from public.console_check_report(f.session_report, null, null, f.ts);
    perform tests.check(r.outcome = 'mismatch', 'a link with neither scope is a mismatch');

    perform tests.check(
        not exists (select 1 from public.console_check_report(gen_random_uuid(), f.session, null, f.ts)),
        'an unknown id returns no row');

    -- The function is the only door: the table itself stays closed to a signed-out visitor.
    begin
        perform tests.check(not exists (select 1 from public.reports),
            'a signed-out visitor reads no report row directly');
    exception when insufficient_privilege then
        null;
    end;
end;
$$;

reset role;
select set_config('request.jwt.claims', '', true);

do $$
declare
    cols text[];
begin
    select array_agg(a.attname::text order by a.attnum) into cols
      from pg_catalog.pg_proc p
      cross join lateral unnest(p.proargnames, p.proargmodes) with ordinality as a(attname, mode, attnum)
     where p.proname = 'console_check_report' and a.mode = 't';
    perform tests.check(
        cols = array['outcome', 'report_type', 'generated_at', 'laboratory_name', 'total_samples',
                     'total_eggs_confirmed', 'positive_species', 'lpf_per_species'],
        'the check returns no identity: no patient, session, user or medtech column');
end;
$$;

-- Failed checks are recorded under their own kind.
insert into public.console_sign_in_attempts (kind, email_hash)
values ('report_check', repeat('a', 64));
