-- Assertions and impersonation for the SQL tests. Loaded after every migration.

create schema tests;
grant usage on schema tests to authenticated, anon;

-- A user with a profile, as signup would make one; `p_role = 'admin'` makes a super admin.
create function tests.create_user(p_email text, p_role text default 'medtech')
returns uuid
language plpgsql
as $$
declare
    v_id uuid;
begin
    insert into auth.users (email) values (p_email) returning id into v_id;
    update public.profiles set role = p_role, full_name = split_part(p_email, '@', 1)
    where id = v_id;
    return v_id;
end;
$$;

-- Runs what follows as this user, through RLS, the way PostgREST would.
create function tests.act_as(p_user uuid)
returns void
language plpgsql
as $$
begin
    perform set_config('request.jwt.claims',
        json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
end;
$$;

-- Back to the table owner, outside RLS.
create function tests.act_as_owner()
returns void
language plpgsql
as $$
begin
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
end;
$$;

create function tests.check(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
    if p_condition is distinct from true then
        raise exception 'FAILED: %', p_message;
    end if;
end;
$$;

-- Passes when the statement fails with this SQLSTATE; any other outcome fails the test.
create function tests.expect_error(p_sql text, p_sqlstate text, p_message text)
returns void
language plpgsql
as $$
begin
    begin
        execute p_sql;
    exception when others then
        if sqlstate = p_sqlstate then
            return;
        end if;
        raise exception 'FAILED: % (expected %, got %: %)', p_message, p_sqlstate, sqlstate, sqlerrm;
    end;
    raise exception 'FAILED: % (expected error %, statement succeeded)', p_message, p_sqlstate;
end;
$$;

grant execute on all functions in schema tests to authenticated, anon;
