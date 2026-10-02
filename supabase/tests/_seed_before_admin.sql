-- Data that exists before the admin migrations run, so the backfill has something to
-- place. Synthetic only. Uses the stubbed auth.users directly; the app's signup trigger
-- creates each profile.

insert into auth.users (id, email) values
    ('00000000-0000-4000-8000-00000000a001', 'seed.admin@example.test'),
    ('00000000-0000-4000-8000-00000000b001', 'seed.medtech1@example.test'),
    ('00000000-0000-4000-8000-00000000b002', 'seed.medtech2@example.test');

do $$
begin
    if to_regclass('public.super_admins') is null then
        raise exception 'The app checkout has no super_admins table (app 0014). '
            'Point AGARTHAVISION_APP_DIR at a checkout that has 0014.';
    end if;
end
$$;

-- A super admin as the live project holds one after app 0014: an active grant, and the
-- retired `role = 'admin'` that 0014 copied the grant from and left in place. admin/0001's
-- backfill still reads `role` to keep super admins out of the starting organization.
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-00000000a001';
insert into public.super_admins (user_id) values ('00000000-0000-4000-8000-00000000a001');

insert into public.patients (id, lastname, firstname, sex, birthdate, psgc_barangay_code, created_by)
values
    ('00000000-0000-4000-8000-0000000000c1', 'Seed', 'One', 'F', '2001-01-01', '0722217001', '00000000-0000-4000-8000-00000000b001'),
    ('00000000-0000-4000-8000-0000000000c2', 'Seed', 'Two', 'M', '2002-02-02', '0722217002', '00000000-0000-4000-8000-00000000b002');
