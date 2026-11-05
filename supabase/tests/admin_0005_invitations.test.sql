-- admin/0005 · invitations: who may invite whom, where, and what accepting grants.

create temporary table fx5 on commit drop as
select tests.create_user('s5@example.test', 'admin') as super_admin,
       tests.create_user('admin.a5@example.test')   as admin_a,
       tests.create_user('tech.a5@example.test')    as medtech_a,
       tests.create_user('admin.b5@example.test')   as admin_b,
       null::uuid as lab_a, null::uuid as lab_b;
grant select on fx5 to authenticated;

do $$
declare
    f        fx5;
    v_inv    uuid;
    v_token  text;
    v_old    text;
    v_new    uuid;
    v_tech   uuid;
    v_state  text;
    v_role   text;
begin
    select * into f from fx5;
    perform tests.act_as(f.super_admin);
    f.lab_a := public.console_create_organization('Invite Lab A');
    f.lab_b := public.console_create_organization('Invite Lab B');
    perform tests.act_as_owner();
    insert into public.organization_members (user_id, organization_id, role) values
        (f.admin_a, f.lab_a, 'org_admin'), (f.medtech_a, f.lab_a, 'medtech'),
        (f.admin_b, f.lab_b, 'org_admin');

    -- ── A super admin invites an org admin, into the organization they choose ──
    perform tests.act_as(f.super_admin);
    select invitation_id, token into v_inv, v_token
    from public.console_invite('  New.Admin@Example.Test ', 'Nora  Admin', f.lab_a);
    perform tests.act_as_owner();
    perform tests.check(
        (select role from public.organization_invitations where id = v_inv) = 'org_admin',
        'a super admin''s invitation is for an org admin');
    perform tests.check(
        (select email from public.organization_invitations where id = v_inv) = 'new.admin@example.test',
        'the email is stored trimmed and lower-case');
    perform tests.check(
        (select token_hash from public.organization_invitations where id = v_inv) <> v_token,
        'the token is never stored as itself');
    perform tests.check(length(v_token) = 64, 'the token is 64 characters');
    perform tests.check(
        exists (select 1 from public.admin_audit_log
                where action = 'invitation.create' and target_id = v_inv::text
                  and actor_id = f.super_admin and organization_id = f.lab_a),
        'the invitation is in the audit trail');

    -- ── An org admin invites a medtech, into their own organization only ──
    perform tests.act_as(f.admin_a);
    select invitation_id into v_tech
    from public.console_invite('new.tech@example.test', null, f.lab_a);
    perform tests.act_as_owner();
    perform tests.check(
        (select role from public.organization_invitations where id = v_tech) = 'medtech',
        'an org admin''s invitation is for a medtech');

    perform tests.act_as(f.admin_a);
    perform tests.expect_error(
        format('select * from public.console_invite(%L, null, %L)', 'x@example.test', f.lab_b),
        '42501', 'an org admin cannot invite into another organization');

    -- A medtech cannot invite at all.
    perform tests.act_as(f.medtech_a);
    perform tests.expect_error(
        format('select * from public.console_invite(%L, null, %L)', 'y@example.test', f.lab_a),
        '42501', 'a medtech cannot invite');

    -- Nobody signed in cannot either.
    perform tests.act_as_owner();
    execute 'set local role anon';
    perform tests.expect_error(
        format('select * from public.console_invite(%L, null, %L)', 'z@example.test', f.lab_a),
        '42501', 'an anonymous visitor cannot invite');
    perform tests.act_as_owner();

    -- ── Refusals: an existing account, a live invitation, a bad address ──
    perform tests.act_as(f.admin_a);
    perform tests.expect_error(
        format('select * from public.console_invite(%L, null, %L)', 'TECH.A5@example.test', f.lab_a),
        '23505', 'an email that already has an account is refused');
    perform tests.expect_error(
        format('select * from public.console_invite(%L, null, %L)', 'new.tech@example.test', f.lab_a),
        '23505', 'an email with a live invitation is refused');
    perform tests.expect_error(
        format('select * from public.console_invite(%L, null, %L)', 'not-an-email', f.lab_a),
        '22023', 'a malformed email is refused');

    -- ── Reads: an org admin sees their organization's invitations, never the hash ──
    perform tests.check(
        (select count(*) from public.organization_invitations) = 2,
        'an org admin reads their own organization''s invitations');
    perform tests.expect_error(
        'select token_hash from public.organization_invitations', '42501',
        'nobody reads the token hash');
    perform tests.act_as(f.admin_b);
    perform tests.check(
        (select count(*) from public.organization_invitations) = 0,
        'an org admin reads no other organization''s invitations');

    -- ── Re-send and revoke ──
    perform tests.expect_error(
        format('select * from public.console_resend_invitation(%L)', v_tech),
        '42501', 'an org admin cannot re-send another organization''s invitation');
    perform tests.act_as(f.admin_a);
    perform tests.expect_error(
        format('select * from public.console_resend_invitation(%L)', v_inv),
        '42501', 'an org admin cannot re-send an org admin invitation');

    -- At most one email a minute.
    perform tests.act_as(f.super_admin);
    perform tests.expect_error(
        format('select * from public.console_resend_invitation(%L)', v_inv),
        '22023', 'an invitation cannot be re-sent within a minute of the last email');
    perform tests.act_as_owner();
    update public.organization_invitations set last_sent_at = now() - interval '2 minutes';

    perform tests.act_as(f.super_admin);
    v_old := v_token;
    select token into v_token from public.console_resend_invitation(v_inv);
    perform tests.check(v_token <> v_old, 're-sending mints a new token');
    select state into v_state from public.console_invitation_by_token(v_old);
    perform tests.check(v_state is null, 'the old link stops working after a re-send');
    perform tests.act_as_owner();
    perform tests.check(
        (select sent_count from public.organization_invitations where id = v_inv) = 2,
        'a re-send is counted');
    perform tests.check(
        exists (select 1 from public.admin_audit_log
                where action = 'invitation.resend' and target_id = v_inv::text),
        'the re-send is in the audit trail');

    -- ── Looking up a link, without an account ──
    execute 'set local role anon';
    select state, role into v_state, v_role from public.console_invitation_by_token(v_token);
    perform tests.check(v_state = 'pending' and v_role = 'org_admin', 'a live link reads as pending');
    perform tests.check(
        not exists (select 1 from public.console_invitation_by_token('nonsense')),
        'an unknown token reveals nothing');
    perform tests.act_as_owner();

    -- ── Accepting: role and organization come from the invitation ──
    -- The invitee's account, as the console's server makes it, with metadata claiming more.
    insert into auth.users (email, raw_user_meta_data)
    values ('new.admin@example.test', '{"role": "admin", "organization_id": "x"}')
    returning id into v_new;

    -- Someone else's account cannot use this link.
    perform tests.act_as(f.medtech_a);
    perform tests.expect_error(
        format('select * from public.console_accept_invitation(%L, null)', v_token),
        '42501', 'an invitation is accepted only by its own email');

    perform tests.act_as(v_new);
    perform public.console_accept_invitation(v_token, ' Nora   Admin ');
    perform tests.act_as_owner();
    perform tests.check(
        (select organization_id = f.lab_a and role = 'org_admin' and status = 'active'
           from public.organization_members where user_id = v_new),
        'accepting makes the membership the invitation names');
    perform tests.check(
        not public.is_admin(v_new),
        'user_metadata claiming admin grants nothing');
    perform tests.check(
        (select full_name from public.profiles where id = v_new) = 'Nora Admin',
        'accepting fills the new profile''s name');
    perform tests.check(
        (select status = 'accepted' and accepted_by = v_new
           from public.organization_invitations where id = v_inv),
        'the invitation is marked accepted');
    perform tests.check(
        exists (select 1 from public.admin_audit_log
                where action = 'invitation.accept' and actor_id = v_new),
        'acceptance is in the audit trail, by the invitee');

    -- A used link cannot be used again.
    perform tests.act_as(v_new);
    perform tests.expect_error(
        format('select * from public.console_accept_invitation(%L, null)', v_token),
        '22023', 'an accepted link cannot be reused');

    -- ── Revoked and expired links fail ──
    perform tests.act_as_owner();
    update public.organization_invitations set last_sent_at = now() - interval '2 minutes';
    perform tests.act_as(f.admin_a);
    select token into v_token from public.console_resend_invitation(v_tech);
    perform public.console_revoke_invitation(v_tech);
    perform tests.act_as_owner();
    perform tests.check(
        exists (select 1 from public.admin_audit_log
                where action = 'invitation.revoke' and target_id = v_tech::text
                  and actor_id = f.admin_a),
        'the revocation is in the audit trail');
    select state into v_state from public.console_invitation_by_token(v_token);
    perform tests.check(v_state = 'revoked', 'a revoked link reads as revoked');

    insert into auth.users (email) values ('new.tech@example.test') returning id into v_new;
    perform tests.act_as(v_new);
    perform tests.expect_error(
        format('select * from public.console_accept_invitation(%L, null)', v_token),
        '22023', 'a revoked link cannot be accepted');
    perform tests.act_as_owner();
    perform tests.check(
        not exists (select 1 from public.organization_members where user_id = v_new),
        'a refused acceptance grants no membership');

    perform tests.act_as(f.admin_a);
    select invitation_id, token into v_inv, v_token
    from public.console_invite('late.tech@example.test', null, f.lab_a);
    perform tests.act_as_owner();
    update public.organization_invitations set expires_at = now() - interval '1 minute'
    where id = v_inv;
    select state into v_state from public.console_invitation_by_token(v_token);
    perform tests.check(v_state = 'expired', 'a link past its expiry reads as expired');
    insert into auth.users (email) values ('late.tech@example.test') returning id into v_new;
    perform tests.act_as(v_new);
    perform tests.expect_error(
        format('select * from public.console_accept_invitation(%L, null)', v_token),
        '22023', 'an expired link cannot be accepted');

    -- An expired invitation no longer blocks a fresh one... once the account is gone.
    perform tests.act_as_owner();
    delete from auth.users where id = v_new;
    perform tests.act_as(f.admin_a);
    perform public.console_invite('late.tech@example.test', null, f.lab_a);

    -- ── An account in no organization (a half-finished acceptance) can be invited ──
    perform tests.act_as_owner();
    insert into auth.users (email) values ('orphan@example.test') returning id into v_new;
    perform tests.act_as(f.admin_a);
    select token into v_token from public.console_invite('orphan@example.test', null, f.lab_a);
    perform tests.act_as(v_new);
    perform public.console_accept_invitation(v_token, null);
    perform tests.act_as_owner();
    perform tests.check(
        (select organization_id from public.organization_members where user_id = v_new) = f.lab_a,
        'an account in no organization joins through its invitation');
    perform tests.act_as(f.admin_a);
    perform tests.expect_error(
        format('select * from public.console_invite(%L, null, %L)', 's5@example.test', f.lab_a),
        '23505', 'a super admin''s email cannot be invited');

    -- ── Nothing writes the table directly ──
    perform tests.expect_error(
        'update public.organization_invitations set status = ''accepted''', '42501',
        'an org admin cannot write an invitation directly');
    perform tests.expect_error(
        'delete from public.organization_invitations', '42501',
        'an org admin cannot delete an invitation');
end
$$;
