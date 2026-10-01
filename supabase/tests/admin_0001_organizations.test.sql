-- admin/0001 · organizations, memberships, patient ownership and the audit log.

-- ── Backfill: everything that existed has a home ─────────────────────────────
do $$
declare
    v_start uuid;
begin
    select id into v_start from public.organizations where name = 'Starting laboratory';
    perform tests.check(v_start is not null, 'the starting organization exists');
    perform tests.check(
        (select count(*) from public.organization_members where organization_id = v_start) = 2,
        'both pre-existing medtechs joined the starting organization');
    perform tests.check(
        not exists (select 1 from public.organization_members
                    where user_id = '00000000-0000-4000-8000-00000000a001'),
        'the pre-existing super admin is not a member of any organization');
    perform tests.check(
        (select count(*) from public.patient_organizations where organization_id = v_start) = 2,
        'both pre-existing patients belong to the starting organization');
    perform tests.check(
        exists (select 1 from public.admin_audit_log where action = 'organization.backfill'),
        'the backfill is in the audit log');
end
$$;

-- ── Fixtures ─────────────────────────────────────────────────────────────────
create temporary table fx on commit drop as
select tests.create_user('super@example.test', 'admin') as super_admin,
       tests.create_user('lead.a@example.test')          as org_admin_a,
       tests.create_user('tech.a@example.test')          as medtech_a,
       tests.create_user('lead.b@example.test')          as org_admin_b;
grant select on fx to authenticated;

-- ── Only a super admin creates, renames and deactivates ──────────────────────
do $$
declare
    f fx;
    v_lab_a uuid;
    v_lab_b uuid;
begin
    select * into f from fx;
    perform tests.act_as(f.super_admin);
    v_lab_a := public.console_create_organization('  Lab   A  ');
    v_lab_b := public.console_create_organization('Lab B');
    perform tests.check(
        (select name from public.organizations where id = v_lab_a) = 'Lab A',
        'a name is trimmed and its spaces collapsed');

    perform public.console_rename_organization(v_lab_a, 'Lab Alpha');
    perform tests.check(
        (select name from public.organizations where id = v_lab_a) = 'Lab Alpha', 'rename works');

    perform tests.expect_error(
        format('select public.console_create_organization(%L)', 'lab b'),
        '23505', 'a name differing only in case is refused');

    perform tests.act_as_owner();
    insert into public.organization_members (user_id, organization_id, role) values
        (f.org_admin_a, v_lab_a, 'org_admin'),
        (f.medtech_a, v_lab_a, 'medtech'),
        (f.org_admin_b, v_lab_b, 'org_admin');

    -- Org admins and medtechs are refused, whatever they call.
    perform tests.act_as(f.org_admin_a);
    perform tests.expect_error(
        format('select public.console_create_organization(%L)', 'Lab C'), '42501',
        'an org admin cannot create an organization');
    perform tests.expect_error(
        format('select public.console_rename_organization(%L, %L)', v_lab_a, 'Mine'), '42501',
        'an org admin cannot rename even their own organization');
    perform tests.expect_error(
        format('select public.console_set_organization_status(%L, %L)', v_lab_b, 'deactivated'),
        '42501', 'an org admin cannot deactivate an organization');
    perform tests.expect_error(
        format('insert into public.organizations (name) values (%L)', 'Direct'), '42501',
        'a direct insert is refused');
    perform tests.expect_error(
        format('update public.organizations set name = %L', 'Hijacked'), '42501',
        'a direct update is refused');

    perform tests.act_as(f.medtech_a);
    perform tests.expect_error(
        format('select public.console_create_organization(%L)', 'Lab D'), '42501',
        'a medtech cannot create an organization');

    -- Reads are scoped.
    perform tests.act_as(f.org_admin_a);
    perform tests.check(
        (select count(*) from public.organizations) = 1, 'an org admin sees only their organization');
    perform tests.check(
        (select count(*) from public.organization_members) = 2,
        'an org admin sees only their organization''s members');

    perform tests.act_as(f.medtech_a);
    perform tests.check(
        (select count(*) from public.organization_members) = 1,
        'a medtech sees only their own membership');
    perform tests.check(
        (select count(*) from public.admin_audit_log) = 0, 'a medtech reads no audit entries');

    perform tests.act_as(f.org_admin_a);
    perform tests.check(
        (select count(*) from public.admin_audit_log) > 0
        and not exists (select 1 from public.admin_audit_log where organization_id <> v_lab_a),
        'an org admin reads only their organization''s audit entries');

    -- Deactivation locks the organization's admins out and deletes nothing.
    perform tests.act_as(f.super_admin);
    perform public.console_set_organization_status(v_lab_a, 'deactivated');
    perform tests.check(
        public.console_org_admin_org(f.org_admin_a) is null,
        'an org admin of a deactivated organization administers nothing');
    perform tests.check(
        (select count(*) from public.organization_members where organization_id = v_lab_a) = 2,
        'deactivating an organization keeps its members');
    perform public.console_set_organization_status(v_lab_a, 'active');
    perform tests.check(
        public.console_org_admin_org(f.org_admin_a) = v_lab_a, 'reactivation restores access');

    -- Every write left an audit row naming its actor.
    perform tests.check(
        (select array_agg(action order by id) from public.admin_audit_log
          where actor_id = f.super_admin)
        = array['organization.create', 'organization.create', 'organization.rename',
                'organization.deactivate', 'organization.reactivate'],
        'each organization write is audited, in order, with its actor');
    perform tests.check(
        (select actor_label from public.admin_audit_log
          where actor_id = f.super_admin limit 1) = 'super',
        'the audit row keeps a readable actor label');
end
$$;

-- ── The audit log cannot be rewritten ────────────────────────────────────────
do $$
declare
    f fx;
begin
    select * into f from fx;
    perform tests.act_as(f.super_admin);
    perform tests.expect_error('update public.admin_audit_log set action = ''x''', '42501',
        'a super admin cannot update an audit entry through the API');
    perform tests.expect_error('delete from public.admin_audit_log', '42501',
        'a super admin cannot delete an audit entry through the API');
    perform tests.expect_error(
        'select public.console_write_audit(''forged'', ''x'', null, null)', '42501',
        'no client can call the audit writer directly');

    perform tests.act_as_owner();
    perform tests.expect_error('update public.admin_audit_log set action = ''x''', 'P0001',
        'even the table owner cannot rewrite an entry');
    perform tests.expect_error('delete from public.admin_audit_log', 'P0001',
        'even the table owner cannot delete an entry');
end
$$;

-- ── Deleting a user still works (the app's behaviour is unchanged) ───────────
do $$
declare
    f fx;
begin
    select * into f from fx;
    perform tests.act_as_owner();
    delete from auth.users where id = f.super_admin;
    -- From the app's 0011 a profile outlives its login, so the entries keep naming the
    -- actor. Before it, the login's delete cascades to the profile.
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'profiles'
                 and column_name = 'account_id') then
        perform tests.check(
            exists (select 1 from public.admin_audit_log where actor_id = f.super_admin),
            'the actor''s entries keep their actor when the login is deleted');
    end if;
    delete from public.profiles where id = f.super_admin;
    perform tests.check(
        exists (select 1 from public.admin_audit_log where actor_id is null and actor_label = 'super'),
        'the actor''s entries survive with their label when the profile is deleted');
end
$$;

-- ── The app keeps working as before ──────────────────────────────────────────
do $$
declare
    f fx;
    v_patient uuid;
begin
    select * into f from fx;
    perform tests.act_as(f.medtech_a);
    -- A plain insert, as PatientRemoteDataSource does: the creator's link is written by an
    -- AFTER trigger, so RETURNING the row cannot pass the SELECT policy yet (app behaviour).
    insert into public.patients (lastname, firstname, sex, birthdate, psgc_barangay_code, created_by)
    values ('New', 'Patient', 'F', '2010-10-10', '0722217003', f.medtech_a);
    select id into v_patient from public.patients where lastname = 'New';
    perform tests.check(v_patient is not null, 'a medtech still registers and reads back a patient');
end
$$;
