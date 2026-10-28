-- admin/0019 · super admins are invited, granted and revoked only by super admins, with every
-- refusal the ticket names (14zcqntjwjg), and each event recorded with no organization.

create temporary table fx19 on commit drop as
select tests.create_user('s19@example.test', 'admin')     as super_admin,
       tests.create_user('s19b@example.test', 'admin')    as super_admin_2,
       tests.create_user('admin.a19@example.test')        as org_admin,
       tests.create_user('tech.a19@example.test')         as tech,
       null::uuid as lab;
grant select on fx19 to authenticated;

do $$
declare
    f        fx19;
    v_inv    uuid;
    v_token  text;
    v_new    uuid;
    v_other  uuid;
    v_otoken text;
begin
    select * into f from fx19;
    perform tests.act_as(f.super_admin);
    f.lab := public.console_create_organization('Super Lab');
    perform tests.act_as_owner();
    insert into public.organization_members (user_id, organization_id, role) values
        (f.org_admin, f.lab, 'org_admin'), (f.tech, f.lab, 'medtech');

    -- ── Only a super admin invites ──
    perform tests.act_as(f.org_admin);
    perform tests.expect_error(
        format('select * from public.console_invite_super_admin(%L, null)', 'x19@example.test'),
        '42501', 'an org admin cannot invite a super admin');
    perform tests.act_as(f.tech);
    perform tests.expect_error(
        format('select * from public.console_invite_super_admin(%L, null)', 'x19@example.test'),
        '42501', 'a medtech cannot invite a super admin');
    perform tests.act_as_owner();
    execute 'set local role anon';
    perform tests.expect_error(
        format('select * from public.console_invite_super_admin(%L, null)', 'x19@example.test'),
        '42501', 'an anonymous visitor cannot invite a super admin');
    perform tests.act_as_owner();

    perform tests.act_as(f.super_admin);
    select invitation_id, token into v_inv, v_token
    from public.console_invite_super_admin('  New.Super@Example.Test ', 'Nova  Super');
    perform tests.act_as_owner();
    perform tests.check(
        (select email from public.super_admin_invitations where id = v_inv) = 'new.super@example.test'
        and (select full_name from public.super_admin_invitations where id = v_inv) = 'Nova Super',
        'the email is stored trimmed and lower-cased, the name spaced once');
    perform tests.check(
        (select expires_at from public.super_admin_invitations where id = v_inv)
            between now() + interval '71 hours' and now() + interval '73 hours',
        'a super admin invitation works for 72 hours');
    perform tests.check(
        exists (select 1 from public.admin_audit_log
                 where action = 'super_admin.invite' and target_id = v_inv::text
                   and organization_id is null and actor_id = f.super_admin),
        'the invitation is audited with no organization');

    -- ── Refusals: an existing account, a live invitation of either kind, a bad address ──
    perform tests.act_as(f.super_admin);
    perform tests.expect_error(
        format('select * from public.console_invite_super_admin(%L, null)', 'TECH.A19@example.test'),
        '23505', 'a laboratory member cannot be invited as a super admin');
    perform tests.expect_error(
        format('select * from public.console_invite_super_admin(%L, null)', 's19b@example.test'),
        '23505', 'a super admin cannot be invited again');
    perform tests.expect_error(
        format('select * from public.console_invite_super_admin(%L, null)', 'new.super@example.test'),
        '23505', 'an email with a live super admin invitation is refused');
    perform public.console_invite('lab.invitee19@example.test', null, f.lab);
    perform tests.expect_error(
        format('select * from public.console_invite_super_admin(%L, null)', 'lab.invitee19@example.test'),
        '23505', 'an email with a live laboratory invitation is refused');
    perform tests.expect_error(
        format('select * from public.console_invite_super_admin(%L, null)', 'not-an-email'),
        '22023', 'a malformed email is refused');

    -- ── Reads: super admins see invitations, never the hash; nobody else sees any ──
    perform tests.check(
        (select count(*) from public.super_admin_invitations) = 1,
        'a super admin reads super admin invitations');
    perform tests.expect_error(
        'select token_hash from public.super_admin_invitations', '42501',
        'the token hash is never readable');
    perform tests.act_as(f.org_admin);
    perform tests.check(
        (select count(*) from public.super_admin_invitations) = 0,
        'an org admin reads no super admin invitation');
    perform tests.expect_error(
        'select * from public.console_list_super_admins()', '42501',
        'an org admin cannot list super admins');

    -- ── The link, open to anyone holding it ──
    perform tests.act_as_owner();
    execute 'set local role anon';
    perform tests.check(
        (select state from public.console_super_admin_invitation_by_token(v_token)) = 'pending',
        'the link resolves for a visitor with no account');
    perform tests.check(
        not exists (select 1 from public.console_super_admin_invitation_by_token(repeat('0', 64))),
        'an unknown token resolves to nothing');
    perform tests.act_as_owner();

    -- ── Withdraw, and a withdrawn link cannot be used ──
    perform tests.act_as(f.super_admin);
    select invitation_id, token into v_other, v_otoken
    from public.console_invite_super_admin('withdrawn19@example.test', null);
    perform tests.act_as(f.org_admin);
    perform tests.expect_error(
        format('select public.console_revoke_super_admin_invitation(%L)', v_other),
        '42501', 'an org admin cannot withdraw a super admin invitation');
    perform tests.act_as(f.super_admin_2);
    perform public.console_revoke_super_admin_invitation(v_other);
    perform tests.expect_error(
        format('select public.console_revoke_super_admin_invitation(%L)', v_other),
        '22023', 'a withdrawn invitation cannot be withdrawn again');
    perform tests.expect_error(
        format('select * from public.console_resend_super_admin_invitation(%L)', v_other),
        '22023', 'a withdrawn invitation cannot be re-sent');
    perform tests.act_as_owner();
    v_other := tests.create_user('withdrawn19@example.test');
    perform tests.act_as(v_other);
    perform tests.expect_error(
        format('select public.console_accept_super_admin_invitation(%L, null)', v_otoken),
        '22023', 'a withdrawn invitation cannot be accepted');
    perform tests.act_as_owner();
    perform tests.check(
        exists (select 1 from public.admin_audit_log
                 where action = 'super_admin.invite_revoke' and actor_id = f.super_admin_2
                   and organization_id is null),
        'the withdrawal is audited with no organization');

    -- ── Re-send: at most once a minute, and the old link stops working ──
    perform tests.act_as(f.super_admin);
    perform tests.expect_error(
        format('select * from public.console_resend_super_admin_invitation(%L)', v_inv),
        '22023', 'a re-send within a minute is refused');
    perform tests.act_as_owner();
    update public.super_admin_invitations set last_sent_at = now() - interval '2 minutes' where id = v_inv;
    perform tests.act_as(f.super_admin);
    select token into v_otoken from public.console_resend_super_admin_invitation(v_inv);
    perform tests.act_as_owner();
    perform tests.check(
        not exists (select 1 from public.console_super_admin_invitation_by_token(v_token)),
        'a re-sent invitation''s old link names nothing');
    v_token := v_otoken;

    -- ── An expired link cannot be accepted ──
    v_new := tests.create_user('new.super@example.test');
    update public.super_admin_invitations set expires_at = now() - interval '1 second' where id = v_inv;
    perform tests.act_as(v_new);
    perform tests.expect_error(
        format('select public.console_accept_super_admin_invitation(%L, null)', v_token),
        '22023', 'an expired invitation cannot be accepted');
    perform tests.act_as_owner();
    update public.super_admin_invitations set expires_at = now() + interval '1 hour' where id = v_inv;

    -- ── Only the invited email accepts; then they are a super admin with no membership ──
    perform tests.act_as(f.tech);
    perform tests.expect_error(
        format('select public.console_accept_super_admin_invitation(%L, null)', v_token),
        '42501', 'an invitation is accepted only by its own email');
    perform tests.act_as(v_new);
    perform tests.check(not public.is_admin(v_new), 'not a super admin before accepting');
    perform public.console_accept_super_admin_invitation(v_token, ' Nova  S. ');
    perform tests.act_as_owner();
    perform tests.check(public.is_admin(v_new), 'accepting grants super admin');
    perform tests.check(
        (select granted_by from public.super_admins where user_id = v_new and revoked_at is null)
            = f.super_admin,
        'the grant names the inviter');
    perform tests.check(
        not exists (select 1 from public.organization_members where user_id = v_new),
        'a grant adds no laboratory membership');
    perform tests.check(
        (select full_name from public.profiles where id = v_new) = 'Nova S.',
        'the name the invitee typed is kept');
    perform tests.check(
        exists (select 1 from public.admin_audit_log
                 where action = 'super_admin.grant' and target_id = v_new::text
                   and organization_id is null and details->>'granted_by' = f.super_admin::text),
        'the grant is audited with no organization, naming the inviter');
    perform tests.act_as(v_new);
    perform tests.expect_error(
        format('select public.console_accept_super_admin_invitation(%L, null)', v_token),
        '22023', 'an accepted invitation cannot be used again');

    -- ── Listing ──
    perform tests.act_as(f.super_admin);
    perform tests.check(
        exists (select 1 from public.console_list_super_admins()
                 where user_id = v_new and granted_by = f.super_admin and email = 'new.super@example.test'),
        'a super admin lists the active super admins and who granted them');

    -- ── Revoke: nobody else, never yourself, never the last ──
    perform tests.act_as(f.org_admin);
    perform tests.expect_error(
        format('select public.console_revoke_super_admin(%L)', v_new),
        '42501', 'an org admin cannot revoke a super admin');
    perform tests.act_as(f.super_admin);
    perform tests.expect_error(
        format('select public.console_revoke_super_admin(%L)', f.super_admin),
        '42501', 'nobody revokes themselves');
    perform tests.expect_error(
        format('select public.console_revoke_super_admin(%L)', f.tech),
        'P0002', 'someone who is not a super admin cannot be revoked');
    perform public.console_revoke_super_admin(v_new);
    perform tests.act_as_owner();
    perform tests.check(not public.is_admin(v_new), 'a revoked super admin is no longer one');
    perform tests.check(
        exists (select 1 from public.super_admins
                 where user_id = v_new and revoked_at is not null and revoked_by = f.super_admin),
        'the revoked grant stays, with who revoked it and when (C8)');
    perform tests.check(
        exists (select 1 from public.admin_audit_log
                 where action = 'super_admin.revoke' and target_id = v_new::text
                   and organization_id is null and actor_id = f.super_admin),
        'the revocation is audited with no organization');

    -- A revoked super admin can revoke nobody.
    perform tests.act_as(v_new);
    perform tests.expect_error(
        format('select public.console_revoke_super_admin(%L)', f.super_admin_2),
        '42501', 'a revoked super admin cannot revoke anyone');
    perform tests.act_as_owner();
end
$$;

-- The last-admin rule: two active grants revoke each other. The first wins; the second caller
-- is no longer a super admin when their turn comes (the lock makes a concurrent pair do the
-- same), and the one left can never revoke themselves, so one super admin always remains.
do $$
declare
    a uuid := tests.create_user('last.a19@example.test', 'admin');
    b uuid := tests.create_user('last.b19@example.test', 'admin');
begin
    update public.super_admins set revoked_at = now()
    where revoked_at is null and user_id not in (a, b);
    perform tests.act_as(a);
    perform public.console_revoke_super_admin(b);
    perform tests.act_as(b);
    perform tests.expect_error(
        format('select public.console_revoke_super_admin(%L)', a),
        '42501', 'once revoked, the other cannot revoke back');
    perform tests.act_as(a);
    perform tests.expect_error(
        format('select public.console_revoke_super_admin(%L)', a),
        '42501', 'the last super admin cannot revoke themselves');
    perform tests.act_as_owner();
    perform tests.check(
        (select count(*) from public.super_admins where revoked_at is null) = 1 and public.is_admin(a),
        'one super admin is always left');
end
$$;
