-- admin/0002 · A laboratory's patients and records stay inside that laboratory
--
-- Run via: Supabase dashboard → SQL Editor → paste → Run. By hand, once.
-- Requires: admin/0001_organizations.sql.
--
-- Two things, both additive:
--
--   1. A new patient belongs to its creator's organization, permanently (D11). A trigger
--      files it in patient_organizations as the app inserts it.
--   2. An org admin reads their organization's patients and everything under them —
--      patient links, sessions, samples, detections, predictions, findings, reports, and
--      the sample frames in Storage. Nothing from any other organization.
--
-- Postgres ORs permissive policies together, so each policy below only ever ADDS rows an
-- org admin may read. The app's own policies are untouched: a medtech still sees exactly
-- what they saw before, and a super admin still sees everything through is_admin().
--
-- ── R4: the trigger must never raise ─────────────────────────────────────────
-- It runs inside the app's patient INSERT. If it raised, patient sync would fail for every
-- medtech. So it catches everything and records nothing when it cannot: a patient whose
-- creator has no organization simply stays unassigned, and a super admin can still see it.

begin;


-- ── 1. Ownership at creation ─────────────────────────────────────────────────
create or replace function public.console_assign_patient_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    begin
        -- The creator's organization whatever the membership's status: a patient registered
        -- by a medtech of a deactivated laboratory still belongs to that laboratory.
        insert into public.patient_organizations (patient_id, organization_id)
        select new.id, m.organization_id
        from public.organization_members m
        where m.user_id = new.created_by
        on conflict (patient_id) do nothing;
    exception when others then
        -- Never into the app's sync. The patient is saved; it is just not assigned.
        raise warning 'console_assign_patient_organization: patient % not assigned (%: %)',
            new.id, sqlstate, sqlerrm;
    end;
    return new;
end;
$$;

revoke execute on function public.console_assign_patient_organization() from public, anon, authenticated;

create trigger console_on_patient_created
after insert on public.patients
for each row execute function public.console_assign_patient_organization();


-- ── 2. Org-admin reads ───────────────────────────────────────────────────────
-- Security-definer helpers, so a policy on one table can ask about another without the
-- caller's own RLS deciding the answer, and without recursion.

create or replace function public.console_admin_owns_patient(p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.patient_organizations po
        where po.patient_id = p_patient
          and po.organization_id = public.console_org_admin_org(auth.uid())
    );
$$;

create or replace function public.console_admin_owns_session(p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.sessions se
        join public.patient_organizations po on po.patient_id = se.patient_id
        where se.id = p_session
          and po.organization_id = public.console_org_admin_org(auth.uid())
    );
$$;

create or replace function public.console_admin_owns_sample(p_sample uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.samples sa
        join public.sessions se on se.id = sa.session_id
        join public.patient_organizations po on po.patient_id = se.patient_id
        where sa.id = p_sample
          and po.organization_id = public.console_org_admin_org(auth.uid())
    );
$$;

-- A member of the org admin's own organization.
create or replace function public.console_admin_shares_org_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.organization_members m
        where m.user_id = p_user
          and m.organization_id = public.console_org_admin_org(auth.uid())
    );
$$;

revoke execute on function public.console_admin_owns_patient(uuid) from public, anon;
revoke execute on function public.console_admin_owns_session(uuid) from public, anon;
revoke execute on function public.console_admin_owns_sample(uuid) from public, anon;
revoke execute on function public.console_admin_shares_org_with(uuid) from public, anon;
grant execute on function public.console_admin_owns_patient(uuid) to authenticated;
grant execute on function public.console_admin_owns_session(uuid) to authenticated;
grant execute on function public.console_admin_owns_sample(uuid) to authenticated;
grant execute on function public.console_admin_shares_org_with(uuid) to authenticated;

create policy "patients: org admin reads their organization"
on public.patients for select to authenticated
using ( public.console_admin_owns_patient(id) );

create policy "patient_users: org admin reads their organization"
on public.patient_users for select to authenticated
using ( public.console_admin_owns_patient(patient_id) );

create policy "sessions: org admin reads their organization"
on public.sessions for select to authenticated
using ( public.console_admin_owns_patient(patient_id) );

create policy "samples: org admin reads their organization"
on public.samples for select to authenticated
using ( public.console_admin_owns_session(session_id) );

create policy "detections: org admin reads their organization"
on public.detections for select to authenticated
using ( public.console_admin_owns_sample(sample_id) );

create policy "predictions: org admin reads their organization"
on public.predictions for select to authenticated
using ( public.console_admin_owns_sample(sample_id) );

create policy "findings: org admin reads their organization"
on public.sample_species_findings for select to authenticated
using ( public.console_admin_owns_sample(sample_id) );

create policy "reports: org admin reads their organization"
on public.reports for select to authenticated
using ( public.console_admin_owns_session(session_id) );

-- Names on screen: the org admin's own members, who are the authors of its records.
create policy "profiles: org admin reads their organization's members"
on public.profiles for select to authenticated
using ( public.console_admin_shares_org_with(id) );

-- Sample frames. Keys are `{user_id}/{sample_id}.jpg`; the sample id is read from the key
-- and matched by primary key, then the stored path is compared, so a key that merely looks
-- like a sample id grants nothing.
create policy "samples: org admin reads their organization's frames"
on storage.objects for select to authenticated
using (
    bucket_id = 'samples'
    and exists (
        select 1 from public.samples sa
        where sa.id::text = regexp_replace(name, '^.*/([^/.]+)\.[^/]*$', '\1')
          and sa.storage_path = name
          and public.console_admin_owns_sample(sa.id)
    )
);


-- ── Backfill ─────────────────────────────────────────────────────────────────
-- admin/0001 placed every patient that existed then. Anything registered between the two
-- migrations goes to its creator's organization now, the same way the trigger would have.
insert into public.patient_organizations (patient_id, organization_id)
select p.id, m.organization_id
from public.patients p
join public.organization_members m on m.user_id = p.created_by
where not exists (select 1 from public.patient_organizations po where po.patient_id = p.id);

commit;
