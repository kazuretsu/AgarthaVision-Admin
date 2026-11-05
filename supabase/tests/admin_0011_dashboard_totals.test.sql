-- admin/0011 · who may count what, and the audit trail's person filter.
-- The figures themselves are checked against the console's reference in
-- admin_0011_dashboard_parity.test.ts.

create temporary table fx11 on commit drop as
select tests.create_user('s11b@example.test', 'admin') as super_admin,
       tests.create_user('admin.a11b@example.test')    as admin_a,
       tests.create_user('admin.off11b@example.test')  as admin_off,
       tests.create_user('tech.a11b@example.test')     as tech_a,
       tests.create_user('admin.b11b@example.test')    as admin_b,
       tests.create_user('tech.b11b@example.test')     as tech_b,
       null::uuid as lab_a, null::uuid as lab_b;
grant select on fx11 to authenticated;

do $$
declare
    f fx11;
    v jsonb;
    n integer;
begin
    select * into f from fx11;
    perform tests.act_as(f.super_admin);
    f.lab_a := public.console_create_organization('Count Lab A');
    f.lab_b := public.console_create_organization('Count Lab B');
    perform tests.act_as_owner();
    insert into public.organization_members (user_id, organization_id, role, status) values
        (f.admin_a, f.lab_a, 'org_admin', 'active'),
        (f.admin_off, f.lab_a, 'org_admin', 'deactivated'),
        (f.tech_a, f.lab_a, 'medtech', 'active'),
        (f.admin_b, f.lab_b, 'org_admin', 'active'),
        (f.tech_b, f.lab_b, 'medtech', 'active');
    update fx11 set lab_a = f.lab_a, lab_b = f.lab_b;

    -- ── Scope is decided in the function ──
    perform tests.act_as(f.admin_a);
    v := public.console_dashboard_figures(f.lab_a);
    perform tests.check(v ? 'smears_examined' and v ? 'trend' and v ? 'species',
        'an org admin counts their own laboratory');
    perform tests.check(public.console_dashboard_figures(null) = v,
        'an org admin naming no laboratory gets their own, not every laboratory');
    perform tests.expect_error(format('select public.console_dashboard_figures(%L)', f.lab_b), '42501',
        'an org admin cannot count another laboratory');

    perform tests.act_as(f.admin_off);
    perform tests.expect_error(format('select public.console_dashboard_figures(%L)', f.lab_a), '42501',
        'a deactivated org admin is refused');

    perform tests.act_as(f.tech_a);
    perform tests.expect_error(format('select public.console_dashboard_figures(%L)', f.lab_a), '42501',
        'a medtech is refused');

    perform tests.act_as(f.super_admin);
    perform tests.check(public.console_dashboard_figures(f.lab_b) ? 'sessions',
        'a super admin counts any laboratory');
    perform tests.check(public.console_dashboard_figures() ? 'sessions',
        'a super admin counts every laboratory');

    -- Counts only: nothing that names a patient, a session or a person.
    v := public.console_dashboard_figures();
    perform tests.check(
        (select array_agg(k order by k) from jsonb_object_keys(v) k)
        = array['fields_verified', 'patients', 'positive_smears', 'sessions', 'smears_examined', 'species', 'trend'],
        'the result carries counts and nothing else');

    -- ── Species names, as canonicalSpecies() gives them ──
    perform tests.check(public.console_canonical_species(' ASCARIS ') = 'Ascaris lumbricoides', 'alias, case, spaces');
    perform tests.check(public.console_canonical_species('hook_worm') = 'Hookworm', 'hookworm alias');
    perform tests.check(public.console_canonical_species('Trichuris_Trichiura') = 'Trichuris trichiura', 'underscore alias');
    perform tests.check(public.console_canonical_species('  Strongyloides ') = 'Strongyloides', 'unknown kept, trimmed');
    perform tests.check(public.console_canonical_species('   ') = 'Unspecified', 'blank is Unspecified');
    perform tests.check(public.console_canonical_species(null) = 'Unspecified', 'null is Unspecified');

    -- ── The audit filter lists only who appears in the trail the reader can read ──
    perform tests.act_as(f.admin_a);
    perform public.console_set_member_status(f.tech_a, 'deactivated');
    perform tests.act_as(f.admin_b);
    perform public.console_set_member_status(f.tech_b, 'deactivated');
    perform tests.act_as(f.super_admin);
    perform public.console_rename_organization(f.lab_a, 'Count Lab A renamed');

    perform tests.act_as(f.admin_a);
    perform tests.check(
        exists (select 1 from public.console_audit_actors() where actor_id = f.admin_a)
        and exists (select 1 from public.console_audit_actors() where actor_id = f.super_admin),
        'an org admin sees who acted in their laboratory');
    perform tests.check(
        not exists (select 1 from public.console_audit_actors() where actor_id = f.admin_b),
        'an org admin does not see who acted only in another laboratory');
    perform tests.check(
        not exists (select 1 from public.console_audit_actors(f.lab_b)),
        'an org admin naming another laboratory sees nobody');
    perform tests.check(
        not exists (select 1 from public.console_audit_actors() where actor_id = f.tech_a),
        'someone who never acted is not listed');
    select count(*) into n from public.console_audit_actors() where actor_id = f.admin_a;
    perform tests.check(n = 1, 'one row per person, however many entries');

    perform tests.act_as(f.super_admin);
    perform tests.check(
        exists (select 1 from public.console_audit_actors() where actor_id = f.admin_b)
        and exists (select 1 from public.console_audit_actors() where actor_id = f.admin_a),
        'a super admin sees everyone in the trail');
    perform tests.check(
        not exists (select 1 from public.console_audit_actors(f.lab_b) where actor_id = f.admin_a),
        'a super admin narrowed to one laboratory sees only its actors');

    -- ── No caller, no figures ──
    perform tests.act_as_owner();
    perform set_config('request.jwt.claims', '', true);
    execute 'set local role anon';
    perform tests.expect_error('select public.console_dashboard_figures()', '42501',
        'an anonymous client cannot call it');
    perform tests.expect_error('select * from public.console_audit_actors()', '42501',
        'an anonymous client cannot list the trail''s people');
end
$$;
