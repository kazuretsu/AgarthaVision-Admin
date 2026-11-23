-- admin/0025 · Check a report from the QR code printed on it (14zcqnty9bj)
--
-- Run via: Supabase dashboard → SQL Editor → paste → Run. By hand, once.
-- Requires: app 0015 (patient reports); admin/0002 (patient_organizations);
-- admin/0022 (attempt limits).
--
-- The app prints a QR code on every session and patient PDF (mobile 86d4a6jzt). It links to
-- `/verify/report?id=<report>&session=<session>|patient=<patient>&ts=<epoch seconds>`, a
-- console page anyone can open without signing in. That page asks the one function below,
-- which answers for one report id and returns only what a reader needs to compare with the
-- paper: when it was made, which laboratory, its type and its stored findings. Never a
-- patient's or medtech's identity, and never the record ids it was asked about.

begin;

-- Failed checks count toward the console's attempt limits under their own kind.
alter table public.console_sign_in_attempts
    drop constraint console_sign_in_attempts_kind_check;
alter table public.console_sign_in_attempts
    add constraint console_sign_in_attempts_kind_check
    check (kind in ('sign_in', 'invitation', 'report_check'));

-- No row: no report has this id (or it has not synced yet). One row with outcome
-- 'mismatch': the id exists but the link's other parts do not match it, so the link was
-- altered or belongs to another report; nothing else is returned. One row with outcome
-- 'confirmed': the link matches the stored report, with its findings.
create function public.console_check_report(
    p_report_id     uuid,
    p_session_id    uuid,
    p_patient_id    uuid,
    p_generated_at  bigint
)
returns table (
    outcome               text,
    report_type           text,
    generated_at          timestamptz,
    laboratory_name       text,
    total_samples         integer,
    total_eggs_confirmed  integer,
    positive_species      text[],
    lpf_per_species       jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
    with r as (
        select rep.*,
               (    pg_catalog.floor(extract(epoch from rep.generated_at))::bigint = p_generated_at
                and case rep.report_type
                        when 'session' then rep.session_id = p_session_id and p_patient_id is null
                        when 'patient' then rep.patient_id = p_patient_id and p_session_id is null
                        else false
                    end) is true as matches
          from public.reports rep
         where rep.id = p_report_id
    )
    select case when r.matches then 'confirmed' else 'mismatch' end,
           case when r.matches then r.report_type end,
           case when r.matches then r.generated_at end,
           case when r.matches then o.name end,
           case when r.matches then r.total_samples end,
           case when r.matches then r.total_eggs_confirmed end,
           case when r.matches then r.positive_species end,
           case when r.matches then r.lpf_per_species end
      from r
      left join public.sessions s on s.id = r.session_id
      left join public.patient_organizations po
             on po.patient_id = coalesce(r.patient_id, s.patient_id)
      left join public.organizations o on o.id = po.organization_id;
$$;

revoke execute on function public.console_check_report(uuid, uuid, uuid, bigint) from public;
grant execute on function public.console_check_report(uuid, uuid, uuid, bigint)
    to anon, authenticated;

commit;
