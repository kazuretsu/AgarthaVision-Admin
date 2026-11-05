-- admin/0011 · Dashboard and export totals counted in the database
--
-- Run via: Supabase dashboard → SQL Editor → paste → Run. By hand, once.
-- Requires: admin/0001_organizations.sql (patient_organizations, admin_audit_log,
-- console_org_admin_org()), admin/0002_patient_scoping.sql, and the app's 0014_super_admins.sql
-- (is_admin()).
--
-- ── Why (14zcqntkg7p) ────────────────────────────────────────────────────────
-- The dashboard and the export page read every session in the period with all its samples and
-- detections, 1,000 rows per request one after another, to add them up in the console. A lab with
-- 20,000 sessions paid 20 sequential requests and megabytes of rows for five numbers. These
-- functions return the totals in one request of a few hundred bytes.
--
-- ── console_dashboard_figures(organization, from, to) ────────────────────────
-- The rules are the console's `summariseDashboard` and `summariseSession`, which are the app's:
--   * the unit is the session (one smear); a deleted sample counts toward nothing;
--   * examined = at least one live sample; fields verified = live samples of examined smears;
--   * positive = a live sample carries a detection the medtech did not reject (verdict other than
--     FALSE_POSITIVE), the rule `barangay_prevalence()` uses;
--   * a species counts once per positive smear, under its canonical name (the medtech's
--     expert_class wins over the model's class_label), as `canonicalSpecies()` names it;
--   * weeks start on Monday and dates are Manila calendar days, the frame the app records in.
-- A console test runs this and `summariseDashboard` on one fixture and requires the same figures.
--
-- Scope is decided here, not by the caller: a super admin reads everything or one laboratory; an
-- organization admin reads their own laboratory only, and asking for another is refused (42501).
-- Anyone else is refused. Security definer because a super admin's table reads return nothing
-- since app 0013 (they read the de-identified views); the result is counts only — no patient,
-- session, barangay or person — so there is nothing to de-identify. No small-cell suppression,
-- exactly as the dashboard did before: it is a laboratory's own totals, not a published map.
--
-- `sessions` (every session in the period, read or not) is what the export page compares with
-- the export's row cap.
--
-- ── console_audit_actors(organization) ───────────────────────────────────────
-- The audit page's person filter listed every profile the reader could see. This lists only the
-- people who appear in the trail the reader can read, under the label the trail shows. Security
-- invoker: admin_audit_log's own policies decide which entries count.
--
-- ── Indexes ──────────────────────────────────────────────────────────────────
-- None added. A laboratory's sessions are reached through patient_organizations and the app's
-- sessions_patient_idx (patient_id, started_at); samples and detections through their session and
-- sample indexes. The all-laboratories total scans sessions, which is milliseconds at the sizes
-- this project will see. An index on sessions(started_at) would be the app's to add.
--
-- Additive only: three functions. Nothing the app owns is altered.

begin;

-- The name a species is reported under. Identical to `canonicalSpecies()` in the console's
-- src/domain/clinical.ts, which is the app's `EggSpecies.fromClassLabel`.
create or replace function public.console_canonical_species(p_label text)
returns text
language sql
immutable
set search_path = public
as $$
    select case
        when lower(v.trimmed) in ('ascaris lumbricoides', 'ascaris', 'ascaris_lumbricoides')
            then 'Ascaris lumbricoides'
        when lower(v.trimmed) in ('trichuris trichiura', 'trichuris', 'trichuris_trichiura')
            then 'Trichuris trichiura'
        when lower(v.trimmed) in ('hookworm', 'hook_worm', 'hook worm')
            then 'Hookworm'
        when v.trimmed = ''
            then 'Unspecified'
        else v.trimmed
    end
    from (select regexp_replace(coalesce(p_label, ''), '^\s+|\s+$', '', 'g') as trimmed) v;
$$;

create or replace function public.console_dashboard_figures(
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
    v_org    uuid;
    v_result jsonb;
begin
    if public.is_admin(auth.uid()) then
        v_org := p_organization;
    else
        v_org := public.console_org_admin_org(auth.uid());
        if v_org is null or (p_organization is not null and p_organization <> v_org) then
            raise exception 'Not permitted to read these figures' using errcode = '42501';
        end if;
    end if;

    with session_in_scope as (
        select se.id, se.patient_id, se.started_at
        from public.sessions se
        where (v_org is null or exists (
                  select 1 from public.patient_organizations po
                  where po.patient_id = se.patient_id and po.organization_id = v_org))
          and (p_from is null or se.started_at >= p_from::timestamp at time zone 'Asia/Manila')
          and (p_to is null or se.started_at < (p_to + 1)::timestamp at time zone 'Asia/Manila')
    ),
    -- Set-based, not per session: one pass over the live samples and one over the counted
    -- detections, each hash-joined to the sessions in scope.
    live_field as (
        select sa.id, sa.session_id
        from public.samples sa
        join session_in_scope s on s.id = sa.session_id
        where sa.deleted_at is null
    ),
    counted as (
        select f.session_id, coalesce(d.expert_class, d.class_label) as label
        from live_field f
        join public.detections d on d.sample_id = f.id
        where d.verdict <> 'FALSE_POSITIVE'
    ),
    smear as (
        select s.id,
               s.patient_id,
               date_trunc('week', s.started_at at time zone 'Asia/Manila')::date as week_start,
               coalesce(fields.n, 0)::integer as fields,
               positive.session_id is not null as is_positive
        from session_in_scope s
        left join (
            select session_id, count(*) as n from live_field group by session_id
        ) fields on fields.session_id = s.id
        left join (select distinct session_id from counted) positive on positive.session_id = s.id
    ),
    examined as (
        select * from smear where fields > 0
    ),
    week as (
        select week_start,
               count(*)::integer                           as examined,
               count(*) filter (where is_positive)::integer as positive
        from examined
        group by week_start
    ),
    -- Each distinct stored label is named once, not once per detection.
    label_species as materialized (
        select l.label, public.console_canonical_species(l.label) as species
        from (select distinct label from counted) l
    ),
    species as (
        -- A counted detection sits on a live field, so its smear is examined and positive.
        select ls.species, count(distinct c.session_id)::integer as positive_smears
        from counted c
        join label_species ls on ls.label = c.label
        group by ls.species
    )
    select jsonb_build_object(
        'sessions',        (select count(*) from session_in_scope),
        'patients',        (select count(distinct patient_id) from examined),
        'smears_examined', (select count(*) from examined),
        'positive_smears', (select count(*) from examined where is_positive),
        'fields_verified', (select coalesce(sum(fields), 0) from examined),
        'trend', coalesce((
            select jsonb_agg(jsonb_build_object(
                       'week_start', week_start, 'examined', examined, 'positive', positive)
                   order by week_start)
            from week), '[]'::jsonb),
        'species', coalesce((
            select jsonb_agg(jsonb_build_object(
                       'species', species, 'positive_smears', positive_smears)
                   order by positive_smears desc, species)
            from species), '[]'::jsonb)
    )
    into v_result;

    return v_result;
end;
$$;

create or replace function public.console_audit_actors(p_organization uuid default null)
returns table (actor_id uuid, actor_label text)
language sql
stable
security invoker
set search_path = public
as $$
    select a.actor_id, a.actor_label
    from (
        select distinct on (l.actor_id) l.actor_id, l.actor_label
        from public.admin_audit_log l
        where l.actor_id is not null
          and (p_organization is null or l.organization_id = p_organization)
        order by l.actor_id, l.at desc, l.id desc
    ) a
    order by a.actor_label nulls last, a.actor_id;
$$;

revoke execute on function public.console_canonical_species(text) from public, anon;
revoke execute on function public.console_dashboard_figures(uuid, date, date) from public, anon;
revoke execute on function public.console_audit_actors(uuid) from public, anon;
grant execute on function public.console_canonical_species(text) to authenticated;
grant execute on function public.console_dashboard_figures(uuid, date, date) to authenticated;
grant execute on function public.console_audit_actors(uuid) to authenticated;

commit;
