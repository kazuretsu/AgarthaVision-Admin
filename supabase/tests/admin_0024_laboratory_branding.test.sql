-- admin/0024 · only active members can read branding, and only their lab admin can edit it

create temporary table fx24 on commit drop as
select tests.create_user('root24@example.test', 'admin') as super_admin,
       tests.create_user('admin.a24@example.test') as admin_a,
       tests.create_user('tech.a24@example.test') as tech_a,
       tests.create_user('admin.b24@example.test') as admin_b,
       tests.create_user('tech.b24@example.test') as tech_b,
       tests.create_user('off.a24@example.test') as inactive_admin,
       tests.create_user('loner24@example.test') as non_member;
grant select on fx24 to authenticated;

do $$
declare
    f         fx24;
    lab_a     uuid;
    lab_b     uuid;
    logo_a    text := 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC';
    logo_b    text := 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
    wide_logo text;
begin
    select * into f from fx24;
    perform tests.act_as(f.super_admin);
    lab_a := public.console_create_organization('Branding Lab A');
    lab_b := public.console_create_organization('Branding Lab B');
    perform tests.act_as_owner();

    insert into public.organization_members (user_id, organization_id, role, status) values
        (f.admin_a, lab_a, 'org_admin', 'active'),
        (f.tech_a, lab_a, 'medtech', 'active'),
        (f.inactive_admin, lab_a, 'org_admin', 'deactivated'),
        (f.admin_b, lab_b, 'org_admin', 'active'),
        (f.tech_b, lab_b, 'medtech', 'active');

    perform tests.act_as(f.tech_a);
    perform tests.check(
        (select name = 'Branding Lab A' and logo_base64 is null from public.get_my_laboratory_branding()),
        'a lab with no logo still returns its name');
    perform tests.expect_error(
        'select * from public.organization_logos', '42501', 'direct logo reads are denied');
    perform tests.expect_error(
        'select public.set_my_laboratory_logo(null)', '42501', 'medtechs cannot change the logo');
    perform tests.expect_error(
        'select public.rename_my_laboratory(''Forbidden Name'')', '42501', 'medtechs cannot rename');

    perform tests.act_as(f.admin_a);
    perform public.rename_my_laboratory('  Branding   Lab   Renamed  ');
    perform public.rename_my_laboratory('Branding Lab Renamed');
    perform public.set_my_laboratory_logo(logo_a);
    perform public.set_my_laboratory_logo(logo_a);
    perform public.set_my_laboratory_logo(logo_b);
    perform tests.expect_error(
        'delete from public.organization_logos', '42501', 'even org admins must write through the RPC');
    perform tests.expect_error(
        'select public.rename_my_laboratory(''Branding Lab B'')', '23505', 'names retain uniqueness');
    perform tests.expect_error(
        'select public.rename_my_laboratory(''  '')', '23514', 'blank names are refused');
    perform tests.expect_error(
        'select public.set_my_laboratory_logo(''YWJj'')', '22023', 'rejects non-PNG bytes');
    perform tests.expect_error(
        pg_catalog.format('select public.set_my_laboratory_logo(%L)', logo_a || E'\n'),
        '22023', 'rejects non-canonical base64');
    perform tests.expect_error(
        pg_catalog.format('select public.set_my_laboratory_logo(%L)', pg_catalog.repeat('A', 174764)),
        '22023', 'rejects decoded payloads above the byte cap');

    wide_logo := pg_catalog.replace(pg_catalog.encode(
        pg_catalog.set_byte(pg_catalog.set_byte(pg_catalog.decode(logo_a, 'base64'), 18, 2), 19, 1),
        'base64'), E'\n', '');
    perform tests.expect_error(
        pg_catalog.format('select public.set_my_laboratory_logo(%L)', wide_logo),
        '22023', 'rejects PNGs wider than 512 pixels');

    perform tests.act_as(f.admin_b);
    perform public.set_my_laboratory_logo(logo_a);
    perform tests.act_as(f.tech_b);
    perform tests.check(
        (select name = 'Branding Lab B' and logo_base64 = logo_a from public.get_my_laboratory_branding()),
        'another lab has its own logo and retains its own name');
    perform tests.act_as(f.tech_a);
    perform tests.check(
        (select name = 'Branding Lab Renamed' and logo_base64 = logo_b from public.get_my_laboratory_branding()),
        'lab members receive the renamed lab and replacement logo as canonical base64');

    perform tests.act_as(f.inactive_admin);
    perform tests.check(
        not exists (select * from public.get_my_laboratory_branding()),
        'a deactivated membership cannot read branding');
    perform tests.expect_error(
        'select public.set_my_laboratory_logo(null)', '42501', 'a deactivated member cannot edit branding');
    perform tests.act_as(f.non_member);
    perform tests.check(
        not exists (select * from public.get_my_laboratory_branding()), 'non-members see no branding');
    perform tests.expect_error(
        'select public.rename_my_laboratory(''Forbidden Name'')', '42501', 'non-members cannot rename');
    perform tests.act_as(f.super_admin);
    perform tests.check(
        not exists (select * from public.get_my_laboratory_branding()),
        'a super admin without a membership does not receive arbitrary lab branding');

    perform tests.act_as_owner();
    execute 'set local role anon';
    perform tests.expect_error(
        'select * from public.get_my_laboratory_branding()', '42501', 'anonymous reads are denied');
    perform tests.expect_error(
        'select public.set_my_laboratory_logo(null)', '42501', 'anonymous writes are denied');
    perform tests.act_as_owner();
    update public.organizations set status = 'deactivated' where id = lab_a;
    perform tests.act_as(f.admin_a);
    perform tests.check(
        not exists (select * from public.get_my_laboratory_branding()),
        'a deactivated laboratory does not expose branding');
    perform tests.expect_error(
        'select public.set_my_laboratory_logo(null)', '42501', 'a deactivated laboratory cannot be edited');
    perform tests.act_as_owner();
    update public.organizations set status = 'active' where id = lab_a;

    perform tests.act_as(f.admin_a);
    perform public.set_my_laboratory_logo(null);
    perform public.set_my_laboratory_logo(null);
    perform tests.check(
        (select name = 'Branding Lab Renamed' and logo_base64 is null from public.get_my_laboratory_branding()),
        'removal preserves the lab name and returns no logo');
    perform tests.act_as_owner();
    perform tests.check(
        (select count(*) from public.admin_audit_log
          where action = 'organization.logo_change' and organization_id = lab_a and actor_id = f.admin_a
            and details = '{"has_logo":true}'::jsonb) = 2,
        'the initial upload and replacement are audited without the image bytes');
    perform tests.check(
        (select count(*) from public.admin_audit_log
          where action = 'organization.logo_change' and organization_id = lab_a and actor_id = f.admin_a
            and details = '{"has_logo":false}'::jsonb) = 1,
        'logo removal is audited once');
    perform tests.check(
        (select count(*) from public.admin_audit_log
          where action = 'organization.rename' and organization_id = lab_a and actor_id = f.admin_a
            and details = '{"from":"Branding Lab A","to":"Branding Lab Renamed"}'::jsonb) = 1,
        'lab rename uses the established audit event and skips identical names');
end
$$;
