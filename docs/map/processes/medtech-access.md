---
verified: 2026-10-05
commit: d2f457b
---

# Medtech access

Input: an org admin (or a super admin) on `/medtechs` → Movement: the laboratory's people are
read with their emails and patient counts; a deactivation blocks the login's sign-in, then
records the membership's status → Output: a medtech who can no longer sign in to the app or
the console, with nothing deleted.

## The page

`/medtechs` (`src/app/(dashboard)/medtechs/page.tsx`) lists one laboratory's **medtechs**
together with its **open medtech invitations** (`medtechRows`, `src/domain/people.ts:35`):
name, email, status (Active, Deactivated, Invited, Invite expired), joined date and how many
of the laboratory's patients each is linked to. Org admins are not listed: this page manages
medtechs only.

- **Who sees which laboratory.** An org admin sees their own, whatever `?org=` says. A super
  admin picks one (`?org=`); without a valid choice the page asks for one.
- **Search, sort and page** live in the URL (`q`, `sort`, `dir`, `page`). The list is small
  per laboratory, so it is read whole and filtered, sorted (`sortPeople`, `:113`; blanks last
  either way, ties by name then email) and cut into pages of 50 in the page. A page past the end
  shows the last page.
- **Invite** (org admins) and **re-send / revoke** on invited rows are the invitation flow
  (`docs/map/processes/invitations.md`). Accepted and revoked invitations are listed below as
  history.

The people are read with `console_organization_people`
(`supabase/migrations/admin/0006_member_status.sql:25`), a security-definer function, because
the email lives in the auth provider's table, which no client may read. It refuses anyone but
a super admin or that laboratory's org admin.

## Deactivate and reactivate

`setMemberStatus` (`src/app/(dashboard)/medtechs/actions.ts:52`):

1. Reads the laboratory's people and finds the member; checks `canChangeMemberStatus`
   (`src/domain/people.ts:147`): a medtech, not the actor, and for an org admin only in their
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
