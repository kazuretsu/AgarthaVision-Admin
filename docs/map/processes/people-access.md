---
verified: 2026-10-06
commit: 8121cf4
---

# People and member access

Input: an org admin (or a super admin) on `/people` → Movement: the laboratory's people are
read with their emails and patient counts; a deactivation blocks the login's sign-in, then
records the membership's status → Output: a member who can no longer sign in to the app or
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
joined date, status (with deactivate/reactivate where the viewer may) and the laboratory's
patients assigned to them (`docs/map/processes/patient-assignment.md`). It opens for a member
of either role, since both do fieldwork (14zcqntkd0w); a patient's Assigned list links to it.
Someone of another laboratory is a 404. For a viewer who could deactivate an active member, it
also reads which of their patients only they cover (`listSoleCoverPatients`, through
`console_member_sole_cover`, `supabase/migrations/admin/0009_org_admin_status.sql:61`, patient
ids only) and marks them "Only active member", with a note to hand them over first.

## Who may deactivate whom (`admin/0009`, 14zcqntkd0x)

| Viewer      | A medtech               | An org admin              |
| ----------- | ----------------------- | ------------------------- |
| Org admin   | of their own laboratory | never — not even a fellow |
| Super admin | of any laboratory       | of any laboratory         |

Nobody changes their own status. Super admins make org admins (by invitation), so super admins
unmake them. `canChangeMemberStatus` (`src/domain/people.ts:182`) decides which rows show the
action; the database function decides again. On the People page, on the person page and on the
organization's Members table (`/organizations/[id]`, super admins), the action appears only
where it is allowed.

**Two deactivations are refused,** in the console before anything is touched and again in the
database (SQLSTATE `23514`):

- **The laboratory's last active org admin** (`isLastActiveOrgAdmin`, `:198`; hint
  `last_org_admin`). Without one, nobody there can invite medtechs or assign patients. Their row
  reads "Only organization admin" instead of a button. Invite the replacement first; to close a
  laboratory, deactivate the organization. The function locks the laboratory's org admin rows
  first, so two concurrent deactivations cannot each leave the other.
- **A patient's only active member,** in either role (hint `sole_cover`): the same "a patient
  keeps an active member of its laboratory" rule assignments follow
  (`docs/map/processes/patient-assignment.md`). The function locks the links of every patient
  the member is on — the rows assigning and removing lock — before counting. Hand the patients
  over first; the person page lists them.

Reactivating is never refused for either.

## Deactivate and reactivate

`setMemberStatus` (`src/app/(dashboard)/people/actions.ts:78`):

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
   admin)"), and does nothing if the status is already that. If it fails, step 2 is undone, and
   a `last_org_admin` or `sole_cover` refusal is explained as above.

**What deactivation does.** A banned login cannot sign in or refresh its session, in the
console or the app. A deactivated org admin is also no org admin to any check
(`console_org_admin_org` reads active memberships), so their next console click shows the
no-access page. The app treats a refused refresh as "deactivated" and signs out and wipes
the phone (SE2 14zcqntjph8). A session already open keeps working until its access token
expires (up to an hour, Supabase's default): RLS on clinical tables keys on the author, not
the membership. **Nothing is deleted** — not the account, the profile, the patient links or
any record (C8). Reactivating lifts the ban.

## If you change this

**Hits**

- `canChangeMemberStatus` / `isLastActiveOrgAdmin` and `console_set_member_status` must agree.
- The cover rule must match `console_unassign_patient` (`admin/0008`): both count any active
  member of the patient's laboratory.
- The app's sign-out-and-wipe depends on the ban being visible as a refused refresh.
- `supabase/tests/admin_0006_member_status.test.sql`,
  `supabase/tests/admin_0009_org_admin_status.test.sql`.

**Does not hit**

- Clinical data, and anything the app owns: `admin/0006` adds two functions.

## See

`src/domain/people.ts`, `src/ports/account-access.ts`, `src/components/people/`,
`docs/map/objects/organizations.md`.
