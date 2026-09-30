-- Data that exists before the admin migrations run, so the backfill has something to
-- place. Synthetic only. Uses the stubbed auth.users directly; the app's signup trigger
-- creates each profile.

insert into auth.users (id, email) values
    ('00000000-0000-4000-8000-00000000a001', 'seed.admin@example.test'),
    ('00000000-0000-4000-8000-00000000b001', 'seed.medtech1@example.test'),
    ('00000000-0000-4000-8000-00000000b002', 'seed.medtech2@example.test');

update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-00000000a001';

insert into public.patients (id, lastname, firstname, sex, birthdate, psgc_barangay_code, created_by)
values
    ('00000000-0000-4000-8000-0000000000c1', 'Seed', 'One', 'F', '2001-01-01', '0722217001', '00000000-0000-4000-8000-00000000b001'),
    ('00000000-0000-4000-8000-0000000000c2', 'Seed', 'Two', 'M', '2002-02-02', '0722217002', '00000000-0000-4000-8000-00000000b002');
