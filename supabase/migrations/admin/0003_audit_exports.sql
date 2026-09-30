-- admin/0003 · Record every research export in the audit trail
--
-- Run via: Supabase dashboard → SQL Editor → paste → Run. By hand, once.
-- Requires: admin/0001_organizations.sql.
--
-- An export takes patients' data out of the console, so it is an administrative act and is
-- logged like one. Any console user may record their own export; the function decides the
-- organization the entry belongs to — an org admin's own, whatever they pass — so an org
-- admin cannot file an entry under another laboratory. Additive only.

begin;

create or replace function public.console_record_export(
    p_organization_id uuid,
    p_details         jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor     uuid := auth.uid();
    v_admin_org uuid := public.console_org_admin_org(v_actor);
    v_org       uuid;
begin
    if public.is_admin(v_actor) then
        v_org := p_organization_id;
    elsif v_admin_org is not null then
        v_org := v_admin_org;
    else
        raise exception 'Only a console user can export' using errcode = '42501';
    end if;

    perform public.console_write_audit(
        'export.research', 'export', null, v_org, coalesce(p_details, '{}'::jsonb));
end;
$$;

revoke execute on function public.console_record_export(uuid, jsonb) from public, anon;
grant execute on function public.console_record_export(uuid, jsonb) to authenticated;

commit;
