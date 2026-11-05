-- admin/0022 · failed sign-in and invitation attempts: counted by hashed key within a window,
-- and only the server, with the service role, can read, write or count them (14zcqntnqp6).

create temporary table fx22 on commit drop as
select tests.create_user('admin.a22@example.test') as someone;
grant select on fx22 to authenticated;

do $$
declare
    f        fx22;
    v_email  text := encode(sha256('ana@lab.test'), 'hex');
    v_other  text := encode(sha256('ben@lab.test'), 'hex');
    v_ip     text := encode(sha256('203.0.113.7'), 'hex');
    v_token  text := public.console_invitation_token_hash(repeat('c', 64));
    v_counts record;
    v_stale  record;
begin
    select * into f from fx22;

    -- ── AC4: no browser — anon and authenticated cannot read, write or count ──
    execute 'set local role anon';
    perform tests.expect_error('select count(*) from public.console_sign_in_attempts',
        '42501', 'a visitor cannot read attempts');
    perform tests.expect_error(
        format('insert into public.console_sign_in_attempts (kind, email_hash) values (%L, %L)',
               'sign_in', v_email),
        '42501', 'a visitor cannot record an attempt');
    perform tests.expect_error(
        format('select * from public.console_failed_attempts(%L, null, null, now())', v_email),
        '42501', 'a visitor cannot count attempts');
    perform tests.act_as(f.someone);
    perform tests.expect_error('select count(*) from public.console_sign_in_attempts',
        '42501', 'a signed-in user cannot read attempts');
    perform tests.expect_error(
        format('insert into public.console_sign_in_attempts (kind, email_hash) values (%L, %L)',
               'sign_in', v_email),
        '42501', 'a signed-in user cannot record an attempt');
    perform tests.expect_error(
        format('delete from public.console_sign_in_attempts where email_hash = %L', v_email),
        '42501', 'a signed-in user cannot erase attempts');
    perform tests.expect_error(
        format('select * from public.console_failed_attempts(%L, null, null, now())', v_email),
        '42501', 'a signed-in user cannot count attempts');

    -- ── The server records and counts ──
    perform tests.act_as_owner();
    execute 'set local role service_role';
    insert into public.console_sign_in_attempts (kind, email_hash, ip_hash) values
        ('sign_in', v_email, v_ip), ('sign_in', v_email, v_ip), ('sign_in', v_other, v_ip),
        ('sign_in', v_email, null);
    insert into public.console_sign_in_attempts (kind, email_hash, ip_hash, token_hash) values
        ('invitation', v_email, v_ip, v_token);
    select * into v_counts
    from public.console_failed_attempts(v_email, v_ip, v_token, now() - interval '15 minutes');
    select * into v_stale
    from public.console_failed_attempts(v_email, v_ip, v_token, now() + interval '1 second');
    -- service_role has no use of the tests schema, so back to the owner by hand.
    execute 'reset role';

    perform tests.check(v_counts.by_email = 4, 'failures for the email, on both forms, are counted');
    perform tests.check(v_counts.by_ip = 4, 'failures from the IP, for any email, are counted');
    perform tests.check(v_counts.by_invitation = 1, 'failures on the link are counted');
    perform tests.check(
        v_stale.by_email = 0 and v_stale.by_ip = 0 and v_stale.by_invitation = 0,
        'failures before the window are not counted');

    -- ── Shape: hashes only, and a link only on an invitation attempt ──
    perform tests.expect_error(
        format('insert into public.console_sign_in_attempts (kind, email_hash) values (%L, %L)',
               'sign_in', 'ana@lab.test'),
        '23514', 'an email in the clear is refused');
    perform tests.expect_error(
        format('insert into public.console_sign_in_attempts (kind, email_hash, token_hash) values (%L, %L, %L)',
               'sign_in', v_email, v_token),
        '23514', 'a sign-in attempt has no link');
    perform tests.check(
        (select relrowsecurity from pg_class where oid = 'public.console_sign_in_attempts'::regclass),
        'row level security is on');
    perform tests.check(
        not exists (select 1 from pg_policies where tablename = 'console_sign_in_attempts'),
        'with no policies');
end
$$;
