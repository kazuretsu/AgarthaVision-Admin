-- admin/0016 · A laboratory's name is cleaned before it is checked and stored
--
-- Run via: Supabase dashboard → SQL Editor → paste → Run. By hand, once.
-- Requires: admin/0001_organizations.sql (organizations, its unique index on the name, and
-- the two functions this replaces). Needs a UTF8 database (normalize()); Supabase is.
--
-- ── Why (14zcqntjw7v) ────────────────────────────────────────────────────────
-- organizations_name_unique (admin/0001) is on lower(btrim(name)), so two laboratories cannot
-- share a name: a patient filed in the wrong one of two look-alikes is the risk it guards.
-- Invisible characters got round it. "Cebu Lab" and "Cebu<zero-width space> Lab" were both
-- accepted and look the same, and so did a no-break space for a space, or a full-width "C" (U+FF23).
--
-- ── console_clean_name(text) ─────────────────────────────────────────────────
-- What a name is stored as, in this order:
--   1. Unicode NFKC: full-width and other compatibility forms become their plain letters,
--      and a no-break or other compatibility space becomes a space.
--   2. Invisible characters removed: Unicode's default-ignorable code points (zero-width
--      spaces and joiners, the byte-order mark, bidirectional marks and isolates, soft
--      hyphen, variation selectors, Hangul fillers, tag characters) and control characters.
--   3. Line breaks, tabs and the remaining Unicode spaces become a space; runs of spaces
--      become one; the ends are trimmed.
-- The console applies the same steps (normaliseOrganizationName, src/domain/organizations.ts),
-- so what the form checks is what the database keeps; supabase/tests checks the two agree.
--
-- ── What changes ─────────────────────────────────────────────────────────────
--   * console_create_organization and console_rename_organization store the cleaned name.
--     The unique index is unchanged: on a cleaned name it already refuses a look-alike, as
--     23505, which the console reads as "Another organization already has that name."
--   * organizations_name_clean: a stored name must be its own cleaned form, so no other
--     write path can store an invisible character either.
--
-- Additive: one function, one constraint, two functions replaced with their signatures and
-- grants. No row is changed. If a stored name is not clean (none was on 2026-10-15), this
-- stops before anything is applied and names the laboratory; rename it, then run this again.

begin;

create or replace function public.console_clean_name(p_name text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
    select pg_catalog.btrim(
        pg_catalog.regexp_replace(
            pg_catalog.regexp_replace(
                pg_catalog.normalize(coalesce(p_name, ''), 'NFKC'),
                -- Default-ignorable code points and control characters (but not the
                -- tab, line breaks and NEL, which step 3 turns into spaces).
                '[\u0001-\u0008\u000E-\u001F\u007F-\u0084\u0086-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF0-\uFFF8\U0001BCA0-\U0001BCA3\U0001D173-\U0001D17A\U000E0000-\U000E0FFF]',
                '', 'g'),
            '[ \t\n\u000B\f\r\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+',
            ' ', 'g'),
        ' ');
$$;

comment on function public.console_clean_name(text) is
    'A laboratory name as stored: NFKC, invisible and control characters removed, spaces collapsed and trimmed (admin/0016).';

-- Left executable by every role: it is pure, reads nothing, and the constraint below runs it
-- for whoever writes the row, so revoking it would refuse writes (a status change included)
-- from any role without the grant.

-- Stop, naming the laboratory, rather than add a constraint a stored name breaks.
do $$
declare
    v_id   uuid;
    v_name text;
begin
    select id, name into v_id, v_name
    from public.organizations
    where name is distinct from public.console_clean_name(name)
    limit 1;
    if found then
        raise exception 'Organization % has a name with invisible or irregular characters: %',
            v_id, pg_catalog.quote_literal(v_name)
            using hint = 'Rename it in the console to the name without them, then run admin/0016 again.';
    end if;
end;
$$;

alter table public.organizations
    add constraint organizations_name_clean check (name = public.console_clean_name(name));

create or replace function public.console_create_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_name text := public.console_clean_name(p_name);
    v_id   uuid;
begin
    if not public.is_admin(auth.uid()) then
        raise exception 'Only a super admin can create an organization' using errcode = '42501';
    end if;

    insert into public.organizations (name, created_by)
    values (v_name, auth.uid())
    returning id into v_id;

    perform public.console_write_audit(
        'organization.create', 'organization', v_id::text, v_id, jsonb_build_object('name', v_name));
    return v_id;
end;
$$;

create or replace function public.console_rename_organization(p_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_name text := public.console_clean_name(p_name);
    v_old  text;
begin
    if not public.is_admin(auth.uid()) then
        raise exception 'Only a super admin can rename an organization' using errcode = '42501';
    end if;

    select name into v_old from public.organizations where id = p_id for update;
    if not found then
        raise exception 'Organization % does not exist', p_id using errcode = 'P0002';
    end if;
    if v_old = v_name then
        return;
    end if;

    update public.organizations set name = v_name where id = p_id;

    perform public.console_write_audit(
        'organization.rename', 'organization', p_id::text, p_id,
        jsonb_build_object('from', v_old, 'to', v_name));
end;
$$;

commit;
