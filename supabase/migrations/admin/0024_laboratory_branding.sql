-- admin/0024 · Laboratory branding for the console and the mobile app
--
-- Run via: Supabase dashboard → SQL Editor → paste → Run. By hand, once.
-- Requires: admin/0001 (organizations, membership and audit); admin/0016 (clean names).
-- admin/0023 was the reverted laboratory-referrals migration.

begin;

-- The Data API exposes the logo only through the membership-scoped read below.
create table public.organization_logos (
    organization_id uuid primary key references public.organizations(id),
    png             bytea not null check (pg_catalog.octet_length(png) between 57 and 131072)
);

alter table public.organization_logos enable row level security;
revoke all on public.organization_logos from public, anon, authenticated;

-- Returns no rows for someone without an active membership in an active laboratory.
-- No caller-supplied identifier or paths are needed to fetch the current logo.
create function public.get_my_laboratory_branding()
returns table (name text, logo_base64 text)
language sql
stable
security definer
set search_path = ''
as $$
    select o.name, pg_catalog.replace(pg_catalog.encode(l.png, 'base64'), E'\n', '')
      from public.organizations o
      left join public.organization_logos l on l.organization_id = o.id
     where o.id = public.console_member_org(auth.uid());
$$;

-- Serialize edits to one laboratory and hold its membership and status through the write.
create function public.require_my_laboratory_for_branding()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_org uuid;
begin
    select o.id into v_org
      from public.organization_members m
      join public.organizations o on o.id = m.organization_id
     where m.user_id = auth.uid()
       and m.role = 'org_admin'
       and m.status = 'active'
       and o.status = 'active'
       for no key update of m, o;

    if not found then
        raise exception 'Only an active organization admin can edit their laboratory branding'
            using errcode = '42501';
    end if;
    return v_org;
end;
$$;

create function public.rename_my_laboratory(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_org  uuid := public.require_my_laboratory_for_branding();
    v_name text := public.console_clean_name(p_name);
    v_old  text;
begin
    select o.name into v_old from public.organizations o where o.id = v_org;
    if v_old = v_name then
        return;
    end if;

    update public.organizations set name = v_name where id = v_org;
    perform public.console_write_audit(
        'organization.rename', 'organization', v_org::text, v_org,
        pg_catalog.jsonb_build_object('from', v_old, 'to', v_name));
end;
$$;

-- A null payload removes the logo. The stored image and audit update are atomic.
create function public.set_my_laboratory_logo(p_logo_base64 text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_org  uuid := public.require_my_laboratory_for_branding();
    v_png  bytea;
    v_size integer;
    v_old  bytea;
begin
    if p_logo_base64 is not null then
        -- Bound input before decoding (ceil(131072 / 3) * 4).
        if pg_catalog.octet_length(p_logo_base64) > 174764 then
            raise exception 'Laboratory logo must be at most 128 KiB' using errcode = '22023';
        end if;
        v_png := pg_catalog.decode(p_logo_base64, 'base64');
        v_size := pg_catalog.octet_length(v_png);
        if v_size > 131072 then
            raise exception 'Laboratory logo must be at most 128 KiB' using errcode = '22023';
        end if;

        -- Require a canonical base64-encoded PNG, with its signature and IHDR/IEND
        -- framing. Bound both dimensions before any consumer allocates a bitmap.
        if v_size < 57
           or pg_catalog.replace(pg_catalog.encode(v_png, 'base64'), E'\n', '') <> p_logo_base64
           or pg_catalog.substr(v_png, 1, 16) <> pg_catalog.decode('89504e470d0a1a0a0000000d49484452', 'hex')
           or pg_catalog.substr(v_png, v_size - 11, 12) <> pg_catalog.decode('0000000049454e44ae426082', 'hex')
        then
            raise exception 'Laboratory logo must be a PNG' using errcode = '22023';
        end if;
        if pg_catalog.substr(v_png, 17, 2) <> pg_catalog.decode('0000', 'hex')
           or pg_catalog.substr(v_png, 21, 2) <> pg_catalog.decode('0000', 'hex')
           or pg_catalog.get_byte(v_png, 18) * 256 + pg_catalog.get_byte(v_png, 19) not between 1 and 512
           or pg_catalog.get_byte(v_png, 22) * 256 + pg_catalog.get_byte(v_png, 23) not between 1 and 512
        then
            raise exception 'Laboratory logo must be at most 512 by 512 pixels' using errcode = '22023';
        end if;
    end if;

    select l.png into v_old from public.organization_logos l where l.organization_id = v_org;
    if v_old is not distinct from v_png then
        return;
    end if;

    if v_png is null then
        delete from public.organization_logos where organization_id = v_org;
    else
        insert into public.organization_logos (organization_id, png) values (v_org, v_png)
        on conflict (organization_id) do update set png = excluded.png;
    end if;

    perform public.console_write_audit(
        'organization.logo_change', 'organization', v_org::text, v_org,
        pg_catalog.jsonb_build_object('has_logo', v_png is not null));
end;
$$;

revoke execute on function public.require_my_laboratory_for_branding() from public, anon, authenticated;
revoke execute on function public.get_my_laboratory_branding() from public, anon;
revoke execute on function public.rename_my_laboratory(text) from public, anon;
revoke execute on function public.set_my_laboratory_logo(text) from public, anon;
grant execute on function public.get_my_laboratory_branding() to authenticated;
grant execute on function public.rename_my_laboratory(text) to authenticated;
grant execute on function public.set_my_laboratory_logo(text) to authenticated;

commit;
