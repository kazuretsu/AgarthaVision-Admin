-- app 0018 · Field data is written only by an active member of an active laboratory
-- (14zcqntnqpa).
--
-- Needs an app checkout with 0018_writes_need_active_lab_member.sql. Every write the phone makes
-- is replayed as an active medtech (allowed), as each kind of account the ticket names
-- (refused), and signed out (refused).

do $$
begin
    if to_regprocedure('app_private.require_active_lab_member()') is null then
        raise exception 'FAILED: the app checkout has no 0018_writes_need_active_lab_member.sql. '
            'Point AGARTHAVISION_APP_DIR at a checkout that has it.';
    end if;
end
$$;

-- One writer per case, each with their own patient, session, sample, detection and finding
-- written as the table owner, so updates and deletes have a row of theirs to aim at.
create temporary table fx18 (
    who        text primary key,
    user_id    uuid,
    patient    uuid default gen_random_uuid(),
    session    uuid default gen_random_uuid(),
    sample     uuid default gen_random_uuid(),
    detection  uuid default gen_random_uuid(),
    finding    uuid default gen_random_uuid()
) on commit drop;
grant select on fx18 to authenticated, anon;

do $$
declare
    v_super uuid := tests.create_user('s18@example.test', 'admin');
    v_lab uuid;
    v_dead_lab uuid;
    r fx18;
begin
    insert into fx18 (who, user_id) values
        ('active medtech', tests.create_user('tech18@example.test')),
        ('active org admin', tests.create_user('admin18@example.test')),
        ('deactivated medtech', tests.create_user('off18@example.test')),
        ('member of a deactivated laboratory', tests.create_user('dead18@example.test')),
        ('account with no membership', tests.create_user('loner18@example.test'));

    perform tests.act_as(v_super);
    v_lab := public.console_create_organization('Writers Lab 18');
    v_dead_lab := public.console_create_organization('Closed Lab 18');
    perform tests.act_as_owner();
    insert into public.organization_members (user_id, organization_id, role, status)
    select user_id, v_lab, 'medtech', 'active' from fx18 where who = 'active medtech'
    union all select user_id, v_lab, 'org_admin', 'active' from fx18 where who = 'active org admin'
    union all select user_id, v_lab, 'medtech', 'deactivated' from fx18 where who = 'deactivated medtech'
    union all select user_id, v_dead_lab, 'medtech', 'active' from fx18 where who = 'member of a deactivated laboratory';
    update public.organizations set status = 'deactivated', deactivated_at = now() where id = v_dead_lab;

    for r in select * from fx18 loop
        insert into public.patients (id, lastname, firstname, sex, birthdate, psgc_barangay_code, created_by)
        values (r.patient, 'Writer', r.who, 'F', '2010-01-01', '0722217001', r.user_id);
        insert into public.sessions (id, user_id, patient_id, device_id)
        values (r.session, r.user_id, r.patient, 'device-18');
        insert into public.samples (id, session_id, user_id, captured_at, storage_path, inference_model_version)
        values (r.sample, r.session, r.user_id, now(), r.user_id || '/' || r.sample || '.jpg', 'v-test');
        insert into public.detections (id, sample_id, class_label, confidence)
        values (r.detection, r.sample, 'ascaris', 0.8);
        insert into public.sample_species_findings (id, sample_id, species, egg_count)
        values (r.finding, r.sample, 'ascaris', 1);
        insert into storage.objects (bucket_id, name, owner)
        values ('samples', r.user_id || '/' || r.sample || '.jpg', r.user_id);
    end loop;
end
$$;

-- Every write the phone makes, for one writer: %1$L user, %2$L patient, %3$L session,
-- %4$L sample, %5$L detection, %6$L finding.
create temporary table writes18 (label text, statement text) on commit drop;
grant select on writes18 to authenticated, anon;
insert into writes18 values
    ('register a patient',
     'insert into public.patients (lastname, firstname, sex, birthdate, psgc_barangay_code, created_by) '
     'values (''New'', ''Patient'', ''M'', ''2011-01-01'', ''0722217001'', %1$L)'),
    ('edit a patient', 'update public.patients set firstname = ''Edited'' where id = %2$L'),
    ('start a session',
     'insert into public.sessions (user_id, patient_id, device_id) values (%1$L, %2$L, ''device-18b'')'),
    ('rename a session', 'update public.sessions set label = ''Renamed'' where id = %3$L'),
    ('capture a field',
     'insert into public.samples (session_id, user_id, captured_at, storage_path, inference_model_version) '
     'values (%3$L, %1$L, now(), %1$L || ''/new.jpg'', ''v-test'')'),
    ('verify a field', 'update public.samples set verified_at = now() where id = %4$L'),
    ('save a detection',
     'insert into public.detections (sample_id, class_label, confidence) values (%4$L, ''trichuris'', 0.7)'),
    ('review a detection', 'update public.detections set verdict = ''CONFIRMED'' where id = %5$L'),
    ('save a prediction',
     'insert into public.predictions (id, sample_id, ordinal, class_label, confidence, bbox_x, bbox_y, bbox_w, bbox_h) '
     'values (gen_random_uuid(), %4$L, 0, ''ascaris'', 0.9, 0.1, 0.1, 0.2, 0.2)'),
    ('save a finding',
     'insert into public.sample_species_findings (sample_id, species, egg_count) values (%4$L, ''hookworm'', 3)'),
    ('correct a finding', 'update public.sample_species_findings set egg_count = 2 where id = %6$L'),
    ('remove a finding', 'delete from public.sample_species_findings where id = %6$L'),
    ('file a session report',
     'insert into public.reports (session_id, user_id, report_type, total_samples, total_eggs_confirmed) '
     'values (%3$L, %1$L, ''session'', 1, 1)'),
    ('upload a frame',
     'insert into storage.objects (bucket_id, name, owner) values (''samples'', %1$L || ''/upload.jpg'', %1$L)'),
    ('replace a frame',
     'update storage.objects set owner = %1$L where bucket_id = ''samples'' and name = %1$L || ''/'' || %4$L || ''.jpg'''),
    ('upload a report file',
     'insert into storage.objects (bucket_id, name, owner) values (''reports'', %1$L || ''/report.pdf'', %1$L)');

-- ── Active members of an active laboratory: every write goes through ─────────
do $$
declare
    r fx18;
    w writes18;
begin
    for r in select * from fx18 where who in ('active medtech', 'active org admin') loop
        perform tests.act_as(r.user_id);
        for w in select * from writes18 loop
            begin
                execute format(w.statement, r.user_id, r.patient, r.session, r.sample, r.detection, r.finding);
            exception when others then
                raise exception 'FAILED: an % can %, got %: %', r.who, w.label, sqlstate, sqlerrm;
            end;
        end loop;
    end loop;
    perform tests.act_as_owner();
    perform tests.check(
        (select count(*) from public.sessions s join fx18 f on f.user_id = s.user_id
          where f.who = 'active medtech') = 2,
        'the active medtech''s new session is saved');
end
$$;

-- ── Everyone else: every write is refused, with a reason the phone can show ──
do $$
declare
    r fx18;
    w writes18;
begin
    for r in select * from fx18
              where who in ('deactivated medtech', 'member of a deactivated laboratory',
                            'account with no membership') loop
        perform tests.act_as(r.user_id);
        for w in select * from writes18 loop
            begin
                execute format(w.statement, r.user_id, r.patient, r.session, r.sample, r.detection, r.finding);
                raise exception 'FAILED: a % could still %', r.who, w.label;
            exception when insufficient_privilege then
                if sqlerrm not like 'not_active_lab_member%' then
                    raise exception 'FAILED: a % trying to % got 42501 without the reason: %',
                        r.who, w.label, sqlerrm;
                end if;
            end;
        end loop;

        -- Reads are unchanged: their own records stay visible until they sign out.
        perform tests.check(exists (select 1 from public.sessions where id = r.session),
            format('a %s still reads their own session', r.who));
    end loop;
end
$$;

-- ── Reactivation lets the same account write again ───────────────────────────
do $$
declare
    r fx18;
begin
    select * into r from fx18 where who = 'deactivated medtech';
    perform tests.act_as_owner();
    update public.organization_members set status = 'active' where user_id = r.user_id;
    perform tests.act_as(r.user_id);
    update public.sessions set label = 'Back at work' where id = r.session;
    perform tests.check((select label from public.sessions where id = r.session) = 'Back at work',
        'a reactivated medtech writes again at once');
end
$$;

-- ── Signed out: refused everywhere ───────────────────────────────────────────
do $$
declare
    r fx18;
    w writes18;
begin
    select * into r from fx18 where who = 'active medtech';
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    execute 'set local role anon';
    for w in select * from writes18 loop
        perform tests.expect_error(
            format(w.statement, r.user_id, r.patient, r.session, r.sample, r.detection, r.finding),
            '42501', format('a signed-out visitor cannot %s', w.label));
    end loop;
    perform tests.expect_error('select 1 from public.sessions', '42501',
        'a signed-out visitor cannot read sessions');
end
$$;

-- ── No policy is left for `anon` ─────────────────────────────────────────────
do $$
begin
    perform tests.check(
        not exists (
            select 1 from pg_policies
            where (schemaname = 'public' or (schemaname = 'storage' and tablename = 'objects'))
              and 'public' = any (roles)
        ),
        'no app or storage policy is written TO public any more');
end
$$;
