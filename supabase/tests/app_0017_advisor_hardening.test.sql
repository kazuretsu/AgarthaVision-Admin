-- app 0017 · Signed-out visitors reach no app table or function; is_admin() answers only
-- about yourself (14zcqntnqxe).
--
-- Needs an app checkout with 0017_advisor_hardening.sql. The phone's flows are replayed as a
-- signed-in medtech to show they still work.

do $$
begin
    if to_regnamespace('app_private') is null then
        raise exception 'FAILED: the app checkout has no 0017_advisor_hardening.sql. '
            'Point AGARTHAVISION_APP_DIR at a checkout that has it.';
    end if;
end
$$;

create temporary table fx17 on commit drop as
select tests.create_user('s17@example.test', 'admin') as super_admin,
       tests.create_user('tech17@example.test')        as tech,
       null::uuid as lab,
       '17000000-0000-4000-8000-000000000001'::uuid as patient,
       '17000000-0000-4000-8000-000000000002'::uuid as session,
       '17000000-0000-4000-8000-000000000003'::uuid as sample;
grant select on fx17 to authenticated, anon;

do $$
declare
    v_lab uuid;
begin
    perform tests.act_as((select super_admin from fx17));
    v_lab := public.console_create_organization('Hardening Lab 17');
    perform tests.act_as_owner();
    update fx17 set lab = v_lab;
    insert into public.organization_members (user_id, organization_id, role)
    select tech, lab, 'medtech' from fx17;
end
$$;

-- ── The advisor's findings are gone ──────────────────────────────────────────
do $$
declare
    v_fn text;
    v_table text;
begin
    perform tests.check(
        (select proconfig from pg_proc where oid = 'public.sessions_patient_is_fixed()'::regprocedure)
            @> array['search_path=""'],
        'sessions_patient_is_fixed() has a fixed search_path');

    foreach v_fn in array array[
        'public.handle_new_user()', 'public.handle_deleted_user()',
        'public.link_patient_creator()', 'public.dedupe_session_label()',
        'public.sessions_patient_is_fixed()'
    ] loop
        perform tests.check(
            not has_function_privilege('anon', v_fn, 'execute')
            and not has_function_privilege('authenticated', v_fn, 'execute'),
            format('nobody signed in or out can call the trigger function %s', v_fn));
    end loop;

    foreach v_fn in array array[
        'public.can_read_report_object(text)', 'public.can_read_sample(uuid)',
        'public.can_read_sample_object(text)', 'public.can_read_session(uuid)',
        'public.is_linked_to_patient(uuid)', 'public.shares_patient_history_with(uuid)',
        'public.barangay_prevalence()', 'public.session_label_duplicates()',
        'public.is_admin(uuid)'
    ] loop
        perform tests.check(not has_function_privilege('anon', v_fn, 'execute'),
            format('a signed-out visitor cannot call %s', v_fn));
        perform tests.check(has_function_privilege('authenticated', v_fn, 'execute'),
            format('policies running as a signed-in user can still call %s', v_fn));
    end loop;

    foreach v_table in array array[
        'public.patients', 'public.patient_users', 'public.sessions', 'public.samples',
        'public.detections', 'public.predictions', 'public.sample_species_findings',
        'public.reports', 'public.profiles'
    ] loop
        perform tests.check(
            not has_table_privilege('anon', v_table,
                'select, insert, update, delete, truncate, references, trigger'),
            format('a signed-out visitor holds no right on %s', v_table));
    end loop;
end
$$;

-- ── Signed out: refused, not just empty ──────────────────────────────────────
do $$
begin
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    execute 'set local role anon';
    perform tests.expect_error('select 1 from public.patients', '42501',
        'a signed-out read of patients is refused');
    perform tests.expect_error('select 1 from public.profiles', '42501',
        'a signed-out read of profiles is refused');
    perform tests.expect_error(
        format('select public.is_admin(%L)', (select super_admin from fx17)), '42501',
        'a signed-out visitor cannot ask whether a user is a super admin');
    perform tests.expect_error('select * from public.barangay_prevalence()', '42501',
        'a signed-out visitor cannot call barangay_prevalence()');
end
$$;

-- ── is_admin(): about yourself only ──────────────────────────────────────────
do $$
declare
    f fx17;
begin
    select * into f from fx17;

    perform tests.act_as(f.super_admin);
    perform tests.check(public.is_admin(f.super_admin), 'a super admin is one when they ask');
    perform tests.check((select is_super_admin from public.console_actor()),
        'the console''s gate still recognises the super admin');

    perform tests.act_as(f.tech);
    perform tests.check(not public.is_admin(f.tech), 'a medtech asking about themselves: no');
    perform tests.check(not public.is_admin(f.super_admin),
        'a medtech asking about a super admin''s ID learns nothing');

    -- Inside a security-definer function (the console's RPCs) the answer is for anyone.
    perform tests.act_as_owner();
    perform tests.check(public.is_admin(f.super_admin),
        'a security-definer caller still asks about anyone');
end
$$;

-- ── The phone's flows still work for a medtech ───────────────────────────────
do $$
declare
    f fx17;
begin
    select * into f from fx17;
    perform tests.act_as(f.tech);

    insert into public.patients (id, lastname, firstname, sex, birthdate, psgc_barangay_code, created_by)
    values (f.patient, 'Hardening', 'Seventeen', 'F', '2014-01-01', '0722217001', f.tech);
    perform tests.check(
        exists (select 1 from public.patient_users where patient_id = f.patient and user_id = f.tech),
        'registering a patient still links its creator (link_patient_creator)');

    insert into public.sessions (id, user_id, patient_id, device_id, label)
    values (f.session, f.tech, f.patient, 'device-17', 'Smear 1');
    insert into public.samples (id, session_id, user_id, captured_at, storage_path, inference_model_version)
    values (f.sample, f.session, f.tech, now(), f.tech || '/frame-17.jpg', 'v-test');
    insert into public.predictions (id, sample_id, ordinal, class_label, confidence, bbox_x, bbox_y, bbox_w, bbox_h)
    values (gen_random_uuid(), f.sample, 0, 'ascaris', 0.9, 0.1, 0.1, 0.2, 0.2);
    insert into public.detections (sample_id, class_label, confidence, verdict)
    values (f.sample, 'ascaris', 0.9, 'CONFIRMED');
    insert into public.sample_species_findings (sample_id, species, egg_count)
    values (f.sample, 'ascaris', 2);
    update public.samples set verified_at = now() where id = f.sample;
    insert into public.reports (session_id, user_id, report_type, total_samples, total_eggs_confirmed)
    values (f.session, f.tech, 'session', 1, 2);
    insert into storage.objects (bucket_id, name, owner)
    values ('samples', f.tech || '/frame-17.jpg', f.tech);

    perform tests.check(
        (select count(*) from public.samples where id = f.sample and verified_at is not null) = 1
        and (select count(*) from public.detections where sample_id = f.sample) = 1
        and (select count(*) from public.sample_species_findings where sample_id = f.sample) = 1
        and (select count(*) from public.reports where session_id = f.session) = 1,
        'the medtech reads back everything they wrote');
end
$$;
