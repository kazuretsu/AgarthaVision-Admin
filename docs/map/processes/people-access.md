---
verified: 2026-11-06
commit: 602768f
---

# People and member access

Input: an org admin (or a super admin) on `/people` → Movement: the laboratory's people are
read with their emails and patient counts; a deactivation blocks the login's sign-in, then
records the membership's status → Output: a member who can no longer sign in to the app or
the console, with nothing deleted.

## The page

`/people` (`src/app/(dashboard)/people/(list)/page.tsx`; the sidebar's **People**, until 14zcqntkd0v
the Medtechs page) lists **everyone** in one laboratory — its org admins and its medtechs,
since a role is a permission level and both do fieldwork — together with its **open
invitations** of either role (`peopleRows`, `src/domain/people.ts:36`). Each row shows the name
with the email beneath, the role (`rowRole`, `:63`), status (Active, Deactivated, Invited,
Invite expired), joined date and how many of the laboratory's patients each is linked to. The
signed-in person's own row is marked **You**. `/medtechs` and `/medtechs/[id]` redirect
permanently to `/people` and `/people/[id]`, query string kept (`next.config.ts:15-19`).

- **Who sees which laboratory.** An org admin sees their own, whatever `?org=` says. A super
  admin picks one (`?org=`); without a valid choice the page asks for one.
- **Search, role, sort and page** live in the URL (`q`, `role` = `all` · `org_admin` ·
  `medtech`, `sort`, `dir`, `page`). The list is small per laboratory, so it is read whole and
  filtered (`filterPeopleByRole`, `:103`), searched, sorted (`sortPeople`, `:145`; by name,
  role, status, joined or patients — org admins first by role; `email` still sorts for old
  links; blanks last either way, ties by name then email) and cut into pages of 50 in the
  page. A page past the end shows the last page.
- **Actions** are only the ones the viewer may take (below): **Offboard** on an active medtech,
  the only way one leaves (`MemberStatusForm`, `src/components/people/MemberStatusForm.tsx:47`);
  **Deactivate** on an active org admin, for a super admin; **Reactivate** on a deactivated
  member of either role; re-send/revoke on invitations the viewer may manage (`canManageInvitation`: an org admin,
  medtech invitations only; a super admin, any).
- **Invite** (org admins) and **re-send / revoke** on invited rows are the invitation flow
  (`docs/map/processes/invitations.md`). Accepted and revoked invitations are listed below as
  history.

The people are read with `console_organization_people`
(`supabase/migrations/admin/0006_member_status.sql:25`), a security-definer function, because
the email lives in the auth provider's table, which no client may read. It refuses anyone but
a super admin or that laboratory's org admin.

A name opens `/people/[userId]` (a super admin's link carries `?org=`): their role, email,
joined date, status (with offboard, deactivate or reactivate where the viewer may) and the laboratory's
patients assigned to them (`docs/map/processes/patient-assignment.md`). It opens for a member
of either role, since both do fieldwork (14zcqntkd0w); a patient's Assigned list links to it.
Someone of another laboratory is a 404. For a viewer who could deactivate an active member, it
also reads which of their patients only they cover (`listSoleCoverPatients`, through
`console_member_sole_cover`, `supabase/migrations/admin/0009_org_admin_status.sql:61`, patient
ids only) and marks them "Only active member", with a note to choose Offboard, which hands
them over and deactivates in one step (`src/app/(dashboard)/people/[userId]/page.tsx:106-152`).

## Who may deactivate whom (`admin/0009`, 14zcqntkd0x)

| Viewer      | A medtech               | An org admin              |
| ----------- | ----------------------- | ------------------------- |
| Org admin   | of their own laboratory | never — not even a fellow |
| Super admin | of any laboratory       | of any laboratory         |

Nobody changes their own status. Super admins make org admins (by invitation), so super admins
unmake them. `canChangeMemberStatus` (`src/domain/people.ts:182`) decides which rows show the
action; the database function decides again. On the People page, on the person page and on the
organization's Members table (`/organizations/[id]`, super admins), the action appears only
where it is allowed. For an active medtech that action is **Offboard** (below), which hands
their patients over and deactivates them in one step; a plain **Deactivate** is offered only
for an org admin, so only to a super admin.

**Two deactivations are refused,** in the console before anything is touched and again in the
database (SQLSTATE `23514`):

- **The laboratory's last active org admin** (`isLastActiveOrgAdmin`, `:215`; hint
  `last_org_admin`). Without one, nobody there can invite medtechs or assign patients. Their row
  reads "Only organization admin" instead of a button. Invite the replacement first; to close a
  laboratory, deactivate the organization. The function locks the laboratory's org admin rows
  before counting so two concurrent deactivations cannot each leave the other.
- **A patient's only active member,** in either role (hint `sole_cover`): the same "a patient
  keeps an active member of its laboratory" rule assignments follow
  (`docs/map/processes/patient-assignment.md`). The function locks the links of every patient
  the member is on — the rows assigning and removing lock — before counting. Hand the patients
  over first, or, for a medtech, Offboard, which does both; the person page lists them.

Reactivating is never refused for either.

## Deactivate and reactivate

`setMemberStatus` (`src/app/(dashboard)/people/actions.ts:94`), behind the page's Deactivate
(an org admin) and Reactivate (either role) buttons:

1. Reads the laboratory's people and finds the member; checks `canChangeMemberStatus` (above).
   A forged member id from elsewhere is "no longer in this laboratory". For a deactivation it
   also refuses the last active org admin and a patient's only cover, before step 2, so a
   refused deactivation never touches the sign-in.
2. Blocks (or allows) the login's sign-in through `AccountAccessPort`: a Supabase **ban**
   (`src/adapters/supabase/account-access.ts`, service-role client). A profile whose login was
   deleted has nothing to block.
3. Records the status with `console_set_member_status` (`admin/0009:87`, replacing
   `admin/0006`'s), which checks the same rules again, writes `member.deactivate` /
   `member.reactivate` with the member's role to the audit trail ("Deactivated … (organization
   admin)"), and does nothing if the status already matches. A `last_org_admin` or `sole_cover`
   refusal is explained as above.

`setMemberStatus` and `offboardMedtech` share `withSignInChange`
(`src/lib/with-sign-in-change.ts:5`). The helper sets sign-in before running the database write.
If the provider refuses the change or is unconfigured, the action reports the sign-in failure
and skips the write. Without an account ID, the helper runs only the write and skips the auth
lookup. If the write throws after a sign-in change, the helper attempts the inverse change.
It logs a rollback failure as "Sign-in change not undone" and rethrows the original write
error so the action can report the database's refusal.

**What deactivation does.** A banned login cannot sign in or refresh its session, in the
console or the app. A deactivated org admin is also no org admin to any check
(`console_org_admin_org` reads active memberships), so their next console click shows the
no-access page. The app treats a refused refresh as "deactivated" and signs out and wipes
the phone (SE2 14zcqntjph8). A session already open can still **read** until its access
token expires (up to an hour, Supabase's default): RLS on clinical reads keys on the author,
not the membership. It can no longer **write**: since the app's
`supabase/migrations/0018_writes_need_active_lab_member.sql` (14zcqntnqpa), every field-data
insert, update and delete, and every upload to the `samples` and `reports` buckets, needs an
active member of an active laboratory, so the phone's next write is refused (42501,
`not_active_lab_member`). **Nothing is deleted** — not the account, the profile, the patient links or
any record (C8). Reactivating lifts the ban.

## A laboratory deactivated, or a super admin revoked (`admin/0021`, 14zcqntnqpd)

Deactivating a **laboratory** ends access for everyone in it, and revoking a **super admin**
ends theirs, but neither banned anyone, so the mobile app kept refreshing. Now, after the change
succeeds, `signInFollowsAccess` (`src/lib/sign-in-follows-access.ts`) asks
`console_record_sign_in_change` which of those people are left with **no access anywhere** (no
active super admin grant, no active membership in an active laboratory), which writes
`account.sign_in_blocked` for each, then bans exactly those logins. Someone who keeps access,
say a revoked super admin who is still an active lab member, is left alone. Reactivating a
laboratory restores (`account.sign_in_restored`) those of its members who have access again; a
member deactivated on their own stays blocked. A login the provider fails to change stays
recorded as attempted, and the page says so. A revoked super admin who is invited again has
their block lifted when they accept (`docs/map/processes/invitations.md`).

## Reset an authenticator app (14zcqntjnt0)

A super admin viewing an org admin sees a "Two-step sign-in" card: whether an app is set up,
read from the auth provider, and "Reset authenticator app" behind a confirmation, for a lost
phone. `resetAuthenticator` (`src/app/(dashboard)/people/actions.ts:326`) records
`member.authenticator_reset` first (`admin/0018`), then removes the login's factors. With no app
left, the org admin signs in on their password alone and may set up a new app on Settings:
two-step sign-in is each admin's choice (14zcqntr31c). Org admins, medtechs' pages and one's own get no
card (`canResetSecondFactor`). The whole flow: `docs/map/processes/second-factor.md`.

## Guided offboarding for medtechs (`admin/0017`, 14zcqntjnt5)

When a medtech leaves the laboratory, their open work must not be stranded. Instead of
having to hand over patients one by one on each patient's page before deactivating the
member, their org admin or a super admin chooses **Offboard** from the medtech's row or page.
It is the only deactivation the console offers for an active medtech:

1. Lists the patients where this medtech is the only active member assigned (`soleCover`).
2. Asks who takes over: one active colleague for all patients, or selected per patient.
3. Reminds the admin to collect the mobile device or have the medtech signed out.
4. On confirm, `offboardMedtech` (`src/app/(dashboard)/people/actions.ts:212`) checks that every patient
   without other active cover has a handover and that each recipient is an active colleague
   of the same laboratory.
   The shared sign-in helper blocks the login before `console_offboard_member` (`admin/0017`) reassigns the
   patients and marks the membership deactivated in one transaction. The database records
   `member.offboard` together with `assignment.add` and `assignment.remove` in the audit trail.
   It checks the caller again (the medtech's own org admin or a super admin, never themselves)
   and checks the sole-cover rule (`sole_cover`) after the handovers.
5. Authorship on sessions, samples and reports remains unchanged under the leaver's name.

## If you change this

**Hits**

- `canChangeMemberStatus` / `isLastActiveOrgAdmin` and `console_set_member_status` must agree.
- The cover rule must match `console_unassign_patient` (`admin/0008`): both count any active
  member of the patient's laboratory.
- The app's sign-out-and-wipe depends on the ban being visible as a refused refresh.
- `console_offboard_member` counts cover with the same `console_sole_cover_patient_ids`
  (`admin/0009`) the deactivation check uses.
- `supabase/tests/admin_0006_member_status.test.sql`,
  `supabase/tests/admin_0009_org_admin_status.test.sql`,
  `supabase/tests/admin_0017_offboard_medtech.test.sql`,
  `supabase/tests/admin_0021_sign_in_follows_access.test.sql`.

**Does not hit**

- Clinical data, and anything the app owns: `admin/0006`, `0009`, `0017` and `0021` add
  functions only.

## See

`src/domain/people.ts`, `src/ports/account-access.ts`, `src/components/people/`,
`docs/map/objects/organizations.md`.
