-- admin/0021 · a laboratory's deactivation and a super admin's revocation block the sign-in of
-- exactly those left with no access, recorded first; reactivation restores it (14zcqntnqpd).

create temporary table fx21 on commit drop as
select tests.create_user('s21@example.test', 'admin')     as super_admin,
       tests.create_user('s21b@example.test', 'admin')    as super_admin_2,
       tests.create_user('admin.a21@example.test')        as org_admin,
       tests.create_user('tech.a21@example.test')         as tech,
       tests.create_user('tech.off21@example.test')       as tech_off,
       tests.create_user('both21@example.test', 'admin')  as member_and_super,
       null::uuid as lab;
grant select on fx21 to authenticated;

do $$
declare
    f       fx21;
    v_users uuid[];
    v_ids   uuid[];
begin
    select * into f from fx21;
    perform tests.act_as(f.super_admin);
    f.lab := public.console_create_organization('Access Lab');
    perform tests.act_as_owner();
    insert into public.organization_members (user_id, organization_id, role, status) values
        (f.org_admin, f.lab, 'org_admin', 'active'),
        (f.tech, f.lab, 'medtech', 'active'),
        (f.tech_off, f.lab, 'medtech', 'deactivated'),
        (f.member_and_super, f.lab, 'medtech', 'active');
    v_users := array[f.org_admin, f.tech, f.tech_off, f.member_and_super];

    -- ── Only a super admin ──
    perform tests.act_as(f.org_admin);
    perform tests.expect_error(
        format('select * from public.console_record_sign_in_change(%L, true, %L)',
               v_users, 'organization.deactivate'),
        '42501', 'an org admin cannot block anyone''s sign-in this way');
    perform tests.act_as(f.super_admin);
    perform tests.expect_error(
        format('select * from public.console_record_sign_in_change(%L, true, %L)', v_users, ' '),
        '22023', 'a cause is required');

    -- ── While the laboratory is active, nobody in it is to be blocked ──
    perform tests.check(
        not exists (select 1 from public.console_record_sign_in_change(v_users, true, 'test')
                     where user_id <> f.tech_off),
        'members with access are never blocked');

    -- ── Laboratory deactivated: everyone left with no access, and only them ──
    perform public.console_set_organization_status(f.lab, 'deactivated');
    select array_agg(r.user_id order by r.user_id) into v_ids
    from public.console_record_sign_in_change(v_users, true, 'organization.deactivate') r;
    perform tests.check(
        v_ids = (select array_agg(u order by u) from unnest(array[f.org_admin, f.tech, f.tech_off]) u),
        'the deactivated laboratory''s members are blocked, the one who is also a super admin is not');
    perform tests.check(
        (select account_id from public.console_record_sign_in_change(array[f.tech], true, 'again'))
            = (select account_id from public.profiles where id = f.tech),
        'the login to block is returned with the person');
    perform tests.act_as_owner();
    perform tests.check(
        exists (select 1 from public.admin_audit_log
                 where action = 'account.sign_in_blocked' and target_id = f.tech::text
                   and organization_id = f.lab and actor_id = f.super_admin
                   and details->>'cause' = 'organization.deactivate'),
        'each block is recorded under the laboratory, with its cause');
    perform tests.check(
        not exists (select 1 from public.admin_audit_log
                     where action = 'account.sign_in_blocked'
                       and target_id = f.member_and_super::text),
        'nobody who keeps access is recorded as blocked');

    -- ── Laboratory reactivated: active members restored, a deactivated member stays blocked ──
    perform tests.act_as(f.super_admin);
    perform public.console_set_organization_status(f.lab, 'active');
    select array_agg(r.user_id order by r.user_id) into v_ids
    from public.console_record_sign_in_change(
        array[f.org_admin, f.tech, f.tech_off], false, 'organization.reactivate') r;
    perform tests.check(
        v_ids = (select array_agg(u order by u) from unnest(array[f.org_admin, f.tech]) u),
        'reactivation restores the active members only');
    perform tests.act_as_owner();
    perform tests.check(
        exists (select 1 from public.admin_audit_log
                 where action = 'account.sign_in_restored' and target_id = f.org_admin::text
                   and details->>'cause' = 'organization.reactivate'),
        'each restore is recorded');

    -- ── A revoked super admin with no laboratory is blocked; with one, is not ──
    perform tests.act_as(f.super_admin);
    perform public.console_revoke_super_admin(f.super_admin_2);
    perform public.console_revoke_super_admin(f.member_and_super);
    select array_agg(r.user_id) into v_ids
    from public.console_record_sign_in_change(
        array[f.super_admin_2, f.member_and_super], true, 'super_admin.revoke') r;
    perform tests.check(v_ids = array[f.super_admin_2],
        'a revoked super admin is blocked unless they still belong to an active laboratory');
    perform tests.act_as_owner();
    perform tests.check(
        exists (select 1 from public.admin_audit_log
                 where action = 'account.sign_in_blocked' and target_id = f.super_admin_2::text
                   and organization_id is null),
        'a super admin''s block is recorded with no organization');

    -- ── The blocked-account lookup: the server only ──
    update auth.users set banned_until = now() + interval '100 years' where id = f.super_admin_2;
    perform tests.act_as(f.super_admin);
    perform tests.expect_error(
        format('select public.console_blocked_account_for_email(%L)', 's21b@example.test'),
        '42501', 'no signed-in user can look up a blocked account');
    perform tests.act_as_owner();
    execute 'set local role anon';
    perform tests.expect_error(
        format('select public.console_blocked_account_for_email(%L)', 's21b@example.test'),
        '42501', 'a visitor cannot look up a blocked account');
    perform tests.act_as_owner();
    execute 'set local role service_role';
    v_ids := array[public.console_blocked_account_for_email(' S21B@example.test '),
                   public.console_blocked_account_for_email('s21@example.test')];
    -- service_role has no use of the tests schema, so back to the owner by hand.
    execute 'reset role';
    perform tests.check(v_ids[1] = f.super_admin_2, 'the server finds a blocked login by its email');
    perform tests.check(v_ids[2] is null, 'a login that is not blocked is not returned');
end
$$;
