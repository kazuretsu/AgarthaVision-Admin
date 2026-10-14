-- admin/0015 · Barangay breakdown: the prevalence map opens a city or municipality
--
-- Run via: Supabase dashboard → SQL Editor → paste → Run. By hand, once.
-- Requires: admin/0014_prevalence_map.sql (the lookup, console_psgc_town(),
-- console_area_figure() and the function this replaces).
--
-- ── Why (14zcqntjnt6) ────────────────────────────────────────────────────────
-- Inside a city or municipality, an admin wants its barangays: examined smears, positives and
-- prevalence, ranked. There are no barangay outlines to draw, so they are a table under the map,
-- not map areas.
--
-- ── console_area_prevalence(level, code, organization, from, to), one more level ─
-- 'town' joins 'country', 'region' and 'province': the town and every barangay in it that has a
-- smear in scope. Replaced in place, not a second function, so the town's own figure and its
-- barangays are counted by the very query that counts it on the province's map; the two cannot
-- disagree. Everything admin/0014 says still holds: the dashboard's counting rule, the scope,
-- and the threshold of 5 applied to each barangay's own count by console_area_figure().
--   * The town's parents are its region and province, for the breadcrumb.
--   * A barangay comes back by code with no name. There is no barangay table, by design (0014
--     places a barangay by rule, not by 42,010 rows); the console names barangays from the same
--     2Q 2026 PSGC release (scripts/geo/build-barangay-names.ts).
--   * Only barangays with a smear in scope are listed: a city can have 897 barangays (Manila),
--     and the console counts the ones with none from the same release.
--   * A barangay recorded with a 2023 Negros Island Region or Sulu code is listed under its
--     current code: the town's current first seven digits and the barangay's last three. PSA
--     kept the lower digits when it renumbered (the app's tools/psgc/README.md).
-- An unknown town is P0002, as an unknown region or province is. A level below the town is
-- 22023.
--
-- Additive in effect: the function keeps its signature, its grants and every answer it gave
-- before; it only accepts one more level. Nothing the app owns is touched.

begin;

create or replace function public.console_area_prevalence(
    p_level        text default 'country',
    p_code         text default null,
    p_organization uuid default null,
    p_from         date default null,
    p_to           date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_org     uuid;
    v_name    text;
    v_parents jsonb := '[]'::jsonb;
    v_result  jsonb;
begin
    if public.is_admin(auth.uid()) then
        v_org := p_organization;
    else
        v_org := public.console_org_admin_org(auth.uid());
        if v_org is null or (p_organization is not null and p_organization <> v_org) then
            raise exception 'Not permitted to read these figures' using errcode = '42501';
        end if;
    end if;

    if p_level = 'country' then
        if p_code is not null then
            raise exception 'The country takes no code' using errcode = '22023';
        end if;
        v_name := 'Philippines';
    elsif p_level = 'region' then
        select r.name into v_name from public.psgc_regions r where r.code = p_code;
        if not found then
            raise exception 'No such region' using errcode = 'P0002';
        end if;
    elsif p_level = 'province' then
        select p.name,
               jsonb_build_array(jsonb_build_object('level', 'region', 'code', r.code, 'name', r.name))
        into v_name, v_parents
        from public.psgc_provinces p
        join public.psgc_regions r on r.code = p.region_code
        where p.code = p_code;
        if not found then
            raise exception 'No such province' using errcode = 'P0002';
        end if;
    elsif p_level = 'town' then
        select t.name,
               jsonb_build_array(
                   jsonb_build_object('level', 'region', 'code', r.code, 'name', r.name),
                   jsonb_build_object('level', 'province', 'code', p.code, 'name', p.name))
        into v_name, v_parents
        from public.psgc_towns t
        join public.psgc_provinces p on p.code = t.province_code
        join public.psgc_regions r on r.code = p.region_code
        where t.code = p_code;
        if not found then
            raise exception 'No such city or municipality' using errcode = 'P0002';
        end if;
    else
        raise exception 'The level is country, region, province or town' using errcode = '22023';
    end if;

    with session_in_scope as (
        select se.id, se.patient_id
        from public.sessions se
        where (v_org is null or exists (
                  select 1 from public.patient_organizations po
                  where po.patient_id = se.patient_id and po.organization_id = v_org))
          and (p_from is null or se.started_at >= p_from::timestamp at time zone 'Asia/Manila')
          and (p_to is null or se.started_at < (p_to + 1)::timestamp at time zone 'Asia/Manila')
    ),
    examined as (
        select distinct sa.session_id
        from public.samples sa
        join session_in_scope s on s.id = sa.session_id
        where sa.deleted_at is null
    ),
    positive as (
        select distinct sa.session_id
        from public.samples sa
        join session_in_scope s on s.id = sa.session_id
        join public.detections d on d.sample_id = sa.id
        where sa.deleted_at is null
          and d.verdict <> 'FALSE_POSITIVE'
    ),
    smear as (
        select pos.session_id is not null as is_positive,
               case when a.code is not null
                    then left(a.code, 7) || right(p.psgc_barangay_code, 3)
                    else p.psgc_barangay_code
               end                        as barangay,
               t.code                     as town,
               t.province_code            as province,
               pr.region_code             as region
        from session_in_scope s
        join examined e on e.session_id = s.id
        join public.patients p on p.id = s.patient_id
        left join public.psgc_town_aliases a
               on a.old_code = public.console_psgc_town(p.psgc_barangay_code)
        left join public.psgc_towns t
               on t.code = coalesce(a.code, public.console_psgc_town(p.psgc_barangay_code))
        left join public.psgc_provinces pr on pr.code = t.province_code
        left join positive pos on pos.session_id = s.id
    ),
    in_area as (
        select
            case p_level
                when 'country'  then region
                when 'region'   then province
                when 'province' then town
                else barangay
            end as child,
            is_positive
        from smear
        where town is not null
          and case p_level
                  when 'country'  then true
                  when 'region'   then region = p_code
                  when 'province' then province = p_code
                  else town = p_code
              end
    ),
    counted as (
        select child,
               count(*)::integer                            as examined,
               count(*) filter (where is_positive)::integer as positive
        from in_area
        group by child
    ),
    child as (
        select r.code, r.name from public.psgc_regions r where p_level = 'country'
        union all
        select p.code, p.name from public.psgc_provinces p
        where p_level = 'region' and p.region_code = p_code
        union all
        select t.code, t.name from public.psgc_towns t
        where p_level = 'province' and t.province_code = p_code
        union all
        -- No barangay table: the barangays with a smear, by code; the console names them.
        select n.child, null::text from counted n where p_level = 'town'
    )
    select jsonb_build_object(
        'level',     p_level,
        'code',      p_code,
        'name',      v_name,
        'parents',   v_parents,
        'figure',    (select public.console_area_figure(
                                 count(*)::integer, (count(*) filter (where is_positive))::integer)
                      from in_area),
        'unplaced',  case when p_level = 'country'
                          then (select count(*) from smear where town is null)::integer end,
        'children',  coalesce((
            select jsonb_agg(
                       jsonb_build_object('code', c.code, 'name', c.name)
                       || public.console_area_figure(n.examined, n.positive)
                       order by c.name, c.code)
            from child c
            left join counted n on n.child = c.code), '[]'::jsonb)
    )
    into v_result;

    return v_result;
end;
$$;

revoke execute on function public.console_area_prevalence(text, text, uuid, date, date) from public, anon;
grant execute on function public.console_area_prevalence(text, text, uuid, date, date) to authenticated;

commit;
