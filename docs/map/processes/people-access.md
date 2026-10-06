---
verified: 2026-10-06
commit: 8121cf4
---

# People and member access

Input: an org admin (or a super admin) on `/people` → Movement: the laboratory's people are
read with their emails and patient counts; a deactivation blocks the login's sign-in, then
records the membership's status → Output: a medtech who can no longer sign in to the app or
the console, with nothing deleted.

## The page

`/people` (`src/app/(dashboard)/people/page.tsx`; the sidebar's **People**, until 14zcqntkd0v
the Medtechs page) lists **everyone** in one laboratory — its org admins and its medtechs,
since a role is a permission level and both do fieldwork — together with its **open
invitations** of either role (`peopleRows`, `src/domain/people.ts:36`). Each row shows the name
with the email beneath, the role (`rowRole`, `:63`), status (Active, Deactivated, Invited,
Invite expired), joined date and how many of the laboratory's patients each is linked to. The
signed-in person's own row is marked **You**. `/medtechs` and `/medtechs/[id]` redirect
permanently to `/people` and `/people/[id]`, query string kept (`next.config.ts:8`).

- **Who sees which laboratory.** An org admin sees their own, whatever `?org=` says. A super
  admin picks one (`?org=`); without a valid choice the page asks for one.
- **Search, role, sort and page** live in the URL (`q`, `role` = `all` · `org_admin` ·
  `medtech`, `sort`, `dir`, `page`). The list is small per laboratory, so it is read whole and
  filtered (`filterPeopleByRole`, `:103`), searched, sorted (`sortPeople`, `:145`; by name,
  role, status, joined or patients — org admins first by role; `email` still sorts for old
  links; blanks last either way, ties by name then email) and cut into pages of 50 in the
  page. A page past the end shows the last page.
- **Actions** are only the ones the viewer may take: deactivate/reactivate on medtechs (below),
  re-send/revoke on invitations the viewer may manage (`canManageInvitation`: an org admin,
  medtech invitations only; a super admin, any).
- **Invite** (org admins) and **re-send / revoke** on invited rows are the invitation flow
  (`docs/map/processes/invitations.md`). Accepted and revoked invitations are listed below as
  history.

The people are read with `console_organization_people`
(`supabase/migrations/admin/0006_member_status.sql:25`), a security-definer function, because
the email lives in the auth provider's table, which no client may read. It refuses anyone but
a super admin or that laboratory's org admin.

A name opens `/people/[userId]` (a super admin's link carries `?org=`): their role, email,
joined date, status (with deactivate/reactivate, medtechs only) and the laboratory's patients
assigned to them (`docs/map/processes/patient-assignment.md`). It opens for a member of either
role, since both do fieldwork (14zcqntkd0w); a patient's Assigned list links to it. Someone of
another laboratory is a 404.

## Deactivate and reactivate

`setMemberStatus` (`src/app/(dashboard)/people/actions.ts:52`):

1. Reads the laboratory's people and finds the member; checks `canChangeMemberStatus`
   (`src/domain/people.ts:181`): a medtech, not the actor, and for an org admin only in their
   own laboratory. A forged member id from elsewhere is "no longer in this laboratory".
2. Blocks (or allows) the login's sign-in through `AccountAccessPort`: a Supabase **ban**
   (`src/adapters/supabase/account-access.ts`, service-role client). A profile whose login was
   deleted has nothing to block.
3. Records the status with `console_set_member_status` (`:71`), which checks the same rule
   again, writes `member.deactivate` / `member.reactivate` to the audit trail, and does nothing
   if the status is already that. If it fails, step 2 is undone.

**What deactivation does.** A banned login cannot sign in or refresh its session, in the
console or the app. The app treats a refused refresh as "deactivated" and signs out and wipes
the phone (SE2 14zcqntjph8). A session already open keeps working until its access token
expires (up to an hour, Supabase's default): RLS on clinical tables keys on the author, not
the membership. **Nothing is deleted** — not the account, the profile, the patient links or
any record (C8). Reactivating lifts the ban.

## If you change this

**Hits**

- `canChangeMemberStatus` and `console_set_member_status` must agree.
- The app's sign-out-and-wipe depends on the ban being visible as a refused refresh.
- `supabase/tests/admin_0006_member_status.test.sql`.

**Does not hit**

- Clinical data, and anything the app owns: `admin/0006` adds two functions.

## See

`src/domain/people.ts`, `src/ports/account-access.ts`, `src/components/people/`,
`docs/map/objects/organizations.md`.
