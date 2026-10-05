-- admin/0004 · An org admin reads their organization's patient reports
--
-- Run via: Supabase dashboard → SQL Editor → paste → Run. By hand, once.
-- Requires: admin/0002_patient_scoping.sql, and the app's 0015_patient_reports.sql.
--
-- App 0015 gave `reports` a second scope. A row is either a session report (`session_id`
-- set, `patient_id` null) or a patient report (`patient_id` set, `session_id` null,
-- `session_ids` listing the sessions it pooled).
--
-- admin/0002's policy finds an org admin's reports through the session:
-- `console_admin_owns_session(session_id)`. A patient report has no session, so that is
-- false for every one of them, and the laboratory that owns the patient could not read it.
--
-- This adds a second permissive policy that finds a patient report through its patient.
-- Postgres ORs permissive policies, so session reports keep 0002's path untouched and a
-- report on another laboratory's patient stays invisible. Additive only: nothing the app
-- owns is altered, and 0002's policy is left as it is.
--
-- Not covered here: the report files in the `reports` bucket. No console page opens them
-- yet, and super admins may not (app 0013: the file prints the patient's name).

begin;

do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'reports' and column_name = 'patient_id'
    ) then
        raise exception 'public.reports has no patient_id column. Apply the app''s '
            '0015_patient_reports.sql before this migration.';
    end if;
end
$$;

create policy "reports: org admin reads their organization's patient reports"
on public.reports for select to authenticated
using ( patient_id is not null and public.console_admin_owns_patient(patient_id) );

commit;
