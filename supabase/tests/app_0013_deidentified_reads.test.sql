-- app 0012/0013 · Super admins read patients de-identified at the database (D19).
--
-- Needs an app checkout with 0012_deidentified_reads.sql and
-- 0013_super_admin_reads_deidentified.sql. The console's super admin reads depend on both.

do $$
begin
    if to_regclass('public.patients_deidentified') is null then
        raise exception 'FAILED: the app checkout has no patients_deidentified view (app 0012). '
            'Point AGARTHAVISION_APP_DIR at a checkout that has 0012 and 0013.';
    end if;
end
$$;

create temporary table fx13 (
    super_admin uuid, lab uuid, org_admin uuid, medtech uuid, colleague uuid,
    patient uuid, session uuid, sample uuid, report uuid
) on commit drop;
grant select on fx13 to authenticated;

do $$
declare
    f fx13;
begin
    f.super_admin := tests.create_user('s13@example.test', 'admin');
    f.org_admin   := tests.create_user('admin13@example.test');
    f.medtech     := tests.create_user('tech13@example.test');
    f.colleague   := tests.create_user('colleague13@example.test');

    perform tests.act_as(f.super_admin);
    f.lab := public.console_create_organization('De-identified Lab');

    perform tests.act_as_owner();
    insert into public.organization_members (user_id, organization_id, role) values
        (f.org_admin, f.lab, 'org_admin'), (f.medtech, f.lab, 'medtech'),
        (f.colleague, f.lab, 'medtech');

    perform tests.act_as(f.medtech);
    insert into public.patients (lastname, firstname, sex, birthdate, psgc_barangay_code, created_by)
    values ('Delta', 'Hidden', 'F', '2014-03-03', '0722217004', f.medtech);

    perform tests.act_as_owner();
    select id into f.patient from public.patients where lastname = 'Delta';
    insert into public.patient_users (patient_id, user_id) values (f.patient, f.colleague);
    insert into public.sessions (user_id, patient_id, device_id, label)
        values (f.medtech, f.patient, 'd', 'DLA-F12-S01') returning id into f.session;
    insert into public.samples (session_id, user_id, captured_at, storage_path, inference_model_version, user_note)
        values (f.session, f.medtech, now(), 'x', 'v', 'Hidden Delta, from the clinic') returning id into f.sample;
    update public.samples set storage_path = user_id || '/' || id || '.jpg' where id = f.sample;
    insert into storage.objects (bucket_id, name, owner)
        select 'samples', storage_path, user_id from public.samples where id = f.sample;
    insert into public.predictions (id, sample_id, ordinal, class_label, confidence, bbox_x, bbox_y, bbox_w, bbox_h)
        values (gen_random_uuid(), f.sample, 0, 'Ascaris lumbricoides', 0.9, 1, 1, 1, 1);
    insert into public.detections (sample_id, class_label, confidence)
        values (f.sample, 'Ascaris lumbricoides', 0.9);
    insert into public.sample_species_findings (sample_id, species, egg_count)
        values (f.sample, 'Ascaris lumbricoides', 1);
    insert into public.reports (session_id, user_id, total_samples, total_eggs_confirmed)
        values (f.session, f.medtech, 1, 1) returning id into f.report;
    insert into storage.objects (bucket_id, name, owner)
        values ('reports', f.medtech || '/' || f.report || '.pdf', f.medtech);

    insert into fx13 select f.*;
end
$$;

-- ── The views hold no identity, by construction ─────────────────────────────
do $$
begin
    perform tests.check(
        not exists (
            select 1 from information_schema.columns
            where table_schema = 'public'
              and (table_name, column_name) in (
                  ('patients_deidentified', 'lastname'), ('patients_deidentified', 'firstname'),
                  ('patients_deidentified', 'middle_name'), ('patients_deidentified', 'sex'),
                  ('patients_deidentified', 'birthdate'), ('sessions_deidentified', 'label'),
                  ('samples_deidentified', 'user_note'))),
        'no de-identified view has an identity column');
end
$$;

-- ── A super admin: no identity through the tables, everything else through the views ─
do $$
declare
    f fx13;
begin
    select * into f from fx13;
    perform tests.act_as(f.super_admin);

    perform tests.check(not exists (select 1 from public.patients where id = f.patient),
        'a super admin reads no patient row, so no name, sex or birthdate');
    perform tests.check(not exists (select 1 from public.sessions where id = f.session),
        'a super admin reads no session row, so no label');
    perform tests.check(not exists (select 1 from public.samples where id = f.sample),
        'a super admin reads no sample row, so no note');
    perform tests.expect_error('select lastname from public.patients_deidentified', '42703',
        'a super admin cannot ask the view for a name');
    perform tests.expect_error('select user_note from public.samples_deidentified', '42703',
        'a super admin cannot ask the view for a note');

    perform tests.check(
        (select psgc_barangay_code from public.patients_deidentified where id = f.patient) = '0722217004'
        and (select created_by from public.patients_deidentified where id = f.patient) = f.medtech,
        'a super admin reads the patient''s barangay and registrar');
    perform tests.check(exists (select 1 from public.sessions_deidentified where id = f.session),
        'a super admin reads the session, de-identified');
    perform tests.check(exists (select 1 from public.samples_deidentified where id = f.sample),
        'a super admin reads the sample, de-identified');

    perform tests.check(exists (select 1 from public.detections where sample_id = f.sample),
        'a super admin still reads detections');
    perform tests.check(exists (select 1 from public.sample_species_findings where sample_id = f.sample),
        'a super admin still reads findings');
    perform tests.check(exists (select 1 from public.predictions where sample_id = f.sample),
        'a super admin still reads predictions');
    perform tests.check(exists (select 1 from public.patient_users where patient_id = f.patient),
        'a super admin still reads patient links');
    perform tests.check(exists (select 1 from public.reports where id = f.report),
        'a super admin still reads the report row');
    perform tests.check(
        not exists (select 1 from storage.objects where bucket_id = 'reports'
                    and name = f.medtech || '/' || f.report || '.pdf'),
        'a super admin cannot read the report file, which prints the name');
    perform tests.check(
        exists (select 1 from storage.objects o join public.samples_deidentified s on s.storage_path = o.name
                where s.id = f.sample and o.bucket_id = 'samples'),
        'a super admin still reads the sample frame');
    perform tests.check(
        not exists (
            select 1 from information_schema.routines r
            join information_schema.parameters p on p.specific_name = r.specific_name
            where r.routine_schema = 'public' and r.routine_name = 'session_label_duplicates'
              and p.parameter_name = 'label'),
        'session_label_duplicates() no longer returns labels');
end
$$;

-- ── An organization admin: unchanged, identified, and nothing from the views ──
do $$
declare
    f fx13;
begin
    select * into f from fx13;
    perform tests.act_as(f.org_admin);
    perform tests.check(
        (select lastname from public.patients where id = f.patient) = 'Delta',
        'an organization admin still reads their patient identified');
    perform tests.check(
        (select label from public.sessions where id = f.session) = 'DLA-F12-S01'
        and (select user_note from public.samples where id = f.sample) is not null,
        'an organization admin still reads labels and notes');
    perform tests.check(
        not exists (select 1 from public.patients_deidentified)
        and not exists (select 1 from public.sessions_deidentified)
        and not exists (select 1 from public.samples_deidentified),
        'the views return nothing to an organization admin');
end
$$;

-- ── Medtechs: unchanged ─────────────────────────────────────────────────────
do $$
declare
    f fx13;
begin
    select * into f from fx13;
    perform tests.act_as(f.medtech);
    perform tests.check(
        (select lastname from public.patients where id = f.patient) = 'Delta'
        and (select user_note from public.samples where id = f.sample) is not null
        and exists (select 1 from public.detections where sample_id = f.sample)
        and exists (select 1 from storage.objects where bucket_id = 'reports'
                    and name = f.medtech || '/' || f.report || '.pdf'),
        'the author reads their patient, note, detections and report file');
    perform tests.check(not exists (select 1 from public.patients_deidentified),
        'the views return nothing to a medtech');

    -- A colleague assigned to the patient keeps 0007's shared history.
    perform tests.act_as(f.colleague);
    perform tests.check(
        exists (select 1 from public.patients where id = f.patient)
        and exists (select 1 from public.sessions where id = f.session)
        and exists (select 1 from public.samples where id = f.sample)
        and exists (select 1 from public.detections where sample_id = f.sample)
        and exists (select 1 from public.reports where id = f.report)
        and exists (select 1 from storage.objects where bucket_id = 'reports'
                    and name = f.medtech || '/' || f.report || '.pdf'),
        'a colleague on the patient still reads its whole history');
end
$$;

-- ── Signed out: nothing ─────────────────────────────────────────────────────
do $$
begin
    perform tests.act_as_owner();
    execute 'set local role anon';
    perform tests.expect_error('select 1 from public.patients_deidentified', '42501',
        'an anonymous caller cannot read the view at all');
    execute 'reset role';
end
$$;
