-- admin/0002 · patients belong to their creator's laboratory; org admins read only theirs.

create temporary table fx2 (
    super_admin uuid, lab_a uuid, lab_b uuid,
    admin_a uuid, medtech_a uuid, admin_b uuid, medtech_b uuid, loner uuid,
    patient_a uuid, patient_b uuid, session_a uuid, session_b uuid, sample_a uuid, sample_b uuid
) on commit drop;
grant select on fx2 to authenticated;

do $$
declare
    f fx2;
begin
    f.super_admin := tests.create_user('s2@example.test', 'admin');
    f.admin_a     := tests.create_user('admin.a2@example.test');
    f.medtech_a   := tests.create_user('tech.a2@example.test');
    f.admin_b     := tests.create_user('admin.b2@example.test');
    f.medtech_b   := tests.create_user('tech.b2@example.test');
    f.loner       := tests.create_user('loner@example.test');

    perform tests.act_as(f.super_admin);
    f.lab_a := public.console_create_organization('Scoping Lab A');
    f.lab_b := public.console_create_organization('Scoping Lab B');

    perform tests.act_as_owner();
    insert into public.organization_members (user_id, organization_id, role) values
        (f.admin_a, f.lab_a, 'org_admin'), (f.medtech_a, f.lab_a, 'medtech'),
        (f.admin_b, f.lab_b, 'org_admin'), (f.medtech_b, f.lab_b, 'medtech');

    -- Each medtech registers a patient and reads one smear, through the app's own path.
    perform tests.act_as(f.medtech_a);
    insert into public.patients (lastname, firstname, sex, birthdate, psgc_barangay_code, created_by)
    values ('Alpha', 'Patient', 'F', '2012-01-01', '0722217001', f.medtech_a);
    perform tests.act_as(f.medtech_b);
    insert into public.patients (lastname, firstname, sex, birthdate, psgc_barangay_code, created_by)
    values ('Bravo', 'Patient', 'M', '2013-01-01', '0722217002', f.medtech_b);

    perform tests.act_as_owner();
    select id into f.patient_a from public.patients where lastname = 'Alpha';
    select id into f.patient_b from public.patients where lastname = 'Bravo';

    insert into public.sessions (user_id, patient_id, device_id) values (f.medtech_a, f.patient_a, 'd')
        returning id into f.session_a;
    insert into public.sessions (user_id, patient_id, device_id) values (f.medtech_b, f.patient_b, 'd')
        returning id into f.session_b;
    insert into public.samples (session_id, user_id, captured_at, storage_path, inference_model_version)
        values (f.session_a, f.medtech_a, now(), 'x', 'v') returning id into f.sample_a;
    insert into public.samples (session_id, user_id, captured_at, storage_path, inference_model_version)
        values (f.session_b, f.medtech_b, now(), 'x', 'v') returning id into f.sample_b;
    update public.samples set storage_path = user_id || '/' || id || '.jpg'
        where id in (f.sample_a, f.sample_b);
    insert into storage.objects (bucket_id, name, owner)
        select 'samples', storage_path, user_id from public.samples where id in (f.sample_a, f.sample_b);
    insert into public.detections (sample_id, class_label, confidence) values
        (f.sample_a, 'Ascaris lumbricoides', 0.9), (f.sample_b, 'Hookworm', 0.8);
    insert into public.sample_species_findings (sample_id, species, egg_count) values
        (f.sample_a, 'Ascaris lumbricoides', 1), (f.sample_b, 'Hookworm', 1);
    insert into public.reports (session_id, user_id, total_samples, total_eggs_confirmed) values
        (f.session_a, f.medtech_a, 1, 1), (f.session_b, f.medtech_b, 1, 1);

    insert into fx2 select f.*;
end
$$;

-- ── Ownership is set at creation, from the creator ───────────────────────────
do $$
declare
    f fx2;
begin
    select * into f from fx2;
    perform tests.check(
        (select organization_id from public.patient_organizations where patient_id = f.patient_a) = f.lab_a,
        'a patient registered by a Lab A medtech belongs to Lab A');
    perform tests.check(
        (select organization_id from public.patient_organizations where patient_id = f.patient_b) = f.lab_b,
        'a patient registered by a Lab B medtech belongs to Lab B');
end
$$;

-- ── A creator with no organization: the patient still syncs, unassigned ──────
do $$
declare
    f fx2;
    v_patient uuid;
begin
    select * into f from fx2;
    perform tests.act_as(f.loner);
    insert into public.patients (lastname, firstname, sex, birthdate, psgc_barangay_code, created_by)
    values ('Loner', 'Patient', 'F', '2014-01-01', '0722217003', f.loner);
    select id into v_patient from public.patients where lastname = 'Loner';
    perform tests.check(v_patient is not null, 'a creator with no organization still saves a patient');
    perform tests.act_as_owner();
    perform tests.check(
        not exists (select 1 from public.patient_organizations where patient_id = v_patient),
        'that patient is simply not assigned');
end
$$;

-- ── The trigger never raises into the app's sync (R4) ───────────────────────
do $$
declare
    f fx2;
begin
    select * into f from fx2;
    perform tests.act_as_owner();
    -- Make every assignment fail.
    alter table public.patient_organizations
        add constraint tests_always_fails check (false) not valid;

    perform tests.act_as(f.medtech_a);
    insert into public.patients (lastname, firstname, sex, birthdate, psgc_barangay_code, created_by)
    values ('Resilient', 'Patient', 'M', '2015-01-01', '0722217001', f.medtech_a);
    perform tests.check(
        exists (select 1 from public.patients where lastname = 'Resilient'),
        'the patient is saved even when assigning it fails');

    perform tests.act_as_owner();
    alter table public.patient_organizations drop constraint tests_always_fails;
end
$$;

-- ── Org admins read their own laboratory, and nothing else ───────────────────
do $$
declare
    f fx2;
begin
    select * into f from fx2;

    perform tests.act_as(f.admin_a);
    perform tests.check(exists (select 1 from public.patients where id = f.patient_a),
        'Lab A''s admin reads Lab A''s patient');
    perform tests.check(not exists (select 1 from public.patients where id = f.patient_b),
        'Lab A''s admin cannot read Lab B''s patient, even by id');
    perform tests.check(exists (select 1 from public.sessions where id = f.session_a)
                    and not exists (select 1 from public.sessions where id = f.session_b),
        'sessions are scoped');
    perform tests.check(exists (select 1 from public.samples where id = f.sample_a)
                    and not exists (select 1 from public.samples where id = f.sample_b),
        'samples are scoped');
    perform tests.check(
        (select count(*) from public.detections where sample_id in (f.sample_a, f.sample_b)) = 1,
        'detections are scoped');
    perform tests.check(
        (select count(*) from public.sample_species_findings where sample_id in (f.sample_a, f.sample_b)) = 1,
        'findings are scoped');
    perform tests.check(
        (select count(*) from public.reports where session_id in (f.session_a, f.session_b)) = 1,
        'reports are scoped');
    perform tests.check(
        exists (select 1 from public.profiles where id = f.medtech_a)
        and not exists (select 1 from public.profiles where id = f.medtech_b),
        'the org admin reads their own members'' names and no one else''s');
    perform tests.check(
        (select count(*) from storage.objects o join public.samples s on s.storage_path = o.name
          where s.id in (f.sample_a, f.sample_b)) = 1,
        'frames in Storage are scoped');
    perform tests.check(
        not exists (select 1 from public.patient_organizations where patient_id = f.patient_b),
        'the org admin cannot see another laboratory''s ownership rows');

    perform tests.act_as(f.admin_b);
    perform tests.check(
        not exists (select 1 from public.patients where id = f.patient_a)
        and exists (select 1 from public.patients where id = f.patient_b),
        'and the other way round');

    -- De-identified, through the app's view (app 0012/0013, D19).
    perform tests.act_as(f.super_admin);
    perform tests.check(
        (select count(*) from public.patients_deidentified where id in (f.patient_a, f.patient_b)) = 2,
        'a super admin reads both, de-identified');

    -- A medtech's own view is exactly what the app's policies gave them.
    perform tests.act_as(f.medtech_a);
    perform tests.check(
        not exists (select 1 from public.patients where id = f.patient_b),
        'a medtech gains nothing from these policies');

    -- Deactivating the organization takes the org admin's reach away with it.
    perform tests.act_as(f.super_admin);
    perform public.console_set_organization_status(f.lab_a, 'deactivated');
    perform tests.act_as(f.admin_a);
    perform tests.check(not exists (select 1 from public.patients where id = f.patient_a),
        'an org admin of a deactivated laboratory reads nothing through it');
end
$$;
