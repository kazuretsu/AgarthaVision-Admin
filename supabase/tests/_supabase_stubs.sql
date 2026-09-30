-- Just enough of a Supabase database for the migrations to apply and their policies to be
-- exercised on a plain local Postgres. Test use only — never run against a real project.

do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin noinherit;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin noinherit;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin noinherit bypassrls;
    end if;
end
$$;

create extension if not exists pgcrypto;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- auth: users, and auth.uid() read from the request's JWT claims, as Supabase does.
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
    id                 uuid primary key default gen_random_uuid(),
    email              text unique,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    banned_until       timestamptz
);

create function auth.uid() returns uuid
language sql stable as $$
    select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;

create function auth.role() returns text
language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
$$;

-- storage: buckets, objects, and the folder helper the app's policies use.
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
    id                 text primary key,
    name               text,
    public             boolean default false,
    file_size_limit    bigint,
    allowed_mime_types text[]
);

create table storage.objects (
    id        uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id),
    name      text not null,
    owner     uuid
);

alter table storage.objects enable row level security;
grant select, insert, update on storage.objects to authenticated;
grant select on storage.buckets to authenticated;

create function storage.foldername(name text) returns text[]
language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

insert into storage.buckets (id, name) values ('samples', 'samples');
