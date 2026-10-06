import { Suspense } from "react";
import { Search } from "lucide-react";
import { getDatabase } from "@/adapters/registry";
import {
  canViewPeople,
  isLastActiveOrgAdmin,
  invitationState,
  isUuid,
  filterPeopleByRole,
  parsePeopleRole,
  peopleRows,
  parsePeopleSort,
  PEOPLE_ROLE_FILTERS,
  PEOPLE_ROLE_FILTER_LABEL,
  parseSortDirection,
  searchPeople,
  sortPeople,
  type ConsoleAccess,
  type OrganizationSummary,
} from "@/domain";
import { MissingEnvironmentError } from "@/lib/env";
import { ANY_CONSOLE_USER, requirePageAccess } from "@/lib/console-access";
import { pageCount, pageOffset, parsePage } from "@/lib/pagination";
import { DataUnavailable } from "@/components/records/DataUnavailable";
import { InviteForm } from "@/components/invitations/InvitationForms";
import { InvitationTable } from "@/components/invitations/InvitationTable";
import { PeopleTable, type PeopleQuery } from "@/components/people/PeopleTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A laboratory's people — its org admins and medtechs, since both do fieldwork —
 * who they are, their role, whether they can sign in, how many patients each is
 * linked to, and the actions to invite, deactivate and reactivate them. An org
 * admin sees their own laboratory; a super admin chooses one (`?org=`). Search,
 * role, sort and page live in the URL.
 *
 * No route-level `loading.tsx`: it would start a 200 before the access check. The
 * page checks first and suspends only the list, keyed by its query.
 */
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

function param(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

async function People({
  access,
  actorId,
  organizationId,
  organizationName,
  query,
}: {
  access: ConsoleAccess;
  actorId: string;
  organizationId: string;
  organizationName: string;
  query: PeopleQuery;
}) {
  let people;
  let invitations;
  try {
    const db = await getDatabase();
    [people, invitations] = await Promise.all([
      db.listPeople(organizationId),
      db.listInvitations(organizationId),
    ]);
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return (
        <p className="text-[13px] text-stone-deep">
          <code className="font-mono">{cause.variable}</code> is not set, so no one could be read.
        </p>
      );
    }
    throw cause;
  }

  const now = new Date();
  const rows = sortPeople(
    searchPeople(filterPeopleByRole(peopleRows(people, invitations, now), query.role), query.q),
    query.sort,
    query.dir,
  );
  const pages = pageCount(rows.length, PAGE_SIZE);
  const page = Math.min(query.page, pages);
  const shown = rows.slice(pageOffset(page, PAGE_SIZE), pageOffset(page, PAGE_SIZE) + PAGE_SIZE);
  const history = invitations.filter((invitation) => {
    const state = invitationState(invitation, now);
    return state === "accepted" || state === "revoked";
  });

  return (
    <>
      <PeopleTable
        rows={shown}
        total={rows.length}
        pages={pages}
        query={{ ...query, page }}
        access={access}
        actorId={actorId}
        organizationId={organizationId}
        organizationName={organizationName}
        lastOrgAdminId={
          people.find((person) => isLastActiveOrgAdmin(people, person.userId))?.userId ?? null
        }
      />
      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-stone-ink">Invitation history</h2>
        <p className="-mt-2 text-[12px] text-stone-mid">
          Accepted and revoked invitations. Open ones are in the list above.
        </p>
        <InvitationTable
          invitations={history}
          access={access}
          caption={`Accepted and revoked invitations into ${organizationName}`}
          empty="No invitation has been accepted or revoked yet."
          now={now}
        />
      </section>
    </>
  );
}

function PeopleFallback() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
      <span className="sr-only">Loading people…</span>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePageAccess(ANY_CONSOLE_USER);
  const params = await searchParams;

  let organizations: OrganizationSummary[] = [];
  let organizationId = "";
  let organizationName = "";
  if (actor.access.kind === "org_admin") {
    organizationId = actor.access.organizationId;
    organizationName = actor.access.organizationName;
  } else {
    try {
      organizations = await (await getDatabase()).listOrganizations();
    } catch (cause) {
      if (cause instanceof MissingEnvironmentError) {
        return <DataUnavailable title="People" variable={cause.variable} />;
      }
      throw cause;
    }
    const chosen = param(params.org);
    const match = isUuid(chosen)
      ? organizations.find((organization) => organization.id === chosen)
      : undefined;
    if (match) {
      organizationId = match.id;
      organizationName = match.name;
    }
  }

  const query: PeopleQuery = {
    org: actor.access.kind === "super_admin" ? organizationId : "",
    q: param(params.q).slice(0, 120),
    role: parsePeopleRole(param(params.role)),
    sort: parsePeopleSort(param(params.sort)),
    dir: parseSortDirection(param(params.dir)),
    page: parsePage(param(params.page)),
  };
  const chosen = organizationId !== "" && canViewPeople(actor.access, organizationId);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-[22px] font-bold text-stone-ink">People</h1>
        <p className="text-[13px] text-stone-mid">
          {actor.access.kind === "org_admin"
            ? `Everyone in ${organizationName}: its organization admins and medical technologists, who all can sign in to the AgarthaVision mobile app. Invite medtechs here; each sets their own password. Deactivating someone stops their sign-in and deletes nothing.`
            : "Any laboratory's organization admins and medical technologists. Organization admins are invited from the laboratory's organization page; medtechs by their laboratory's organization admins."}
        </p>
      </header>

      {actor.access.kind === "org_admin" ? (
        <Card>
          <CardContent>
            <InviteForm organizationId={organizationId} role="medtech" />
          </CardContent>
        </Card>
      ) : null}

      <form method="get" action="/people" className="flex flex-wrap items-end gap-2">
        {actor.access.kind === "super_admin" ? (
          <label className="flex min-w-56 flex-col gap-1">
            <span className="text-[12px] font-medium text-stone-deep">Organization</span>
            <NativeSelect name="org" defaultValue={organizationId}>
              <NativeSelectOption value="">Choose an organization</NativeSelectOption>
              {organizations.map((organization) => (
                <NativeSelectOption key={organization.id} value={organization.id}>
                  {organization.name}
                  {organization.status === "deactivated" ? " (deactivated)" : ""}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        ) : null}
        <label className="flex min-w-64 flex-1 flex-col gap-1">
          <span className="text-[12px] font-medium text-stone-deep">Search</span>
          <Input name="q" defaultValue={query.q} maxLength={120} placeholder="Name or email" />
        </label>
        <label className="flex min-w-48 flex-col gap-1">
          <span className="text-[12px] font-medium text-stone-deep">Role</span>
          <NativeSelect name="role" defaultValue={query.role}>
            {PEOPLE_ROLE_FILTERS.map((role) => (
              <NativeSelectOption key={role} value={role}>
                {PEOPLE_ROLE_FILTER_LABEL[role]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        {query.sort !== "name" ? <input type="hidden" name="sort" value={query.sort} /> : null}
        {query.dir !== "asc" ? <input type="hidden" name="dir" value={query.dir} /> : null}
        <Button type="submit" variant="outline">
          <Search aria-hidden />
          {actor.access.kind === "super_admin" ? "Show" : "Search"}
        </Button>
      </form>

      {chosen ? (
        <Suspense key={JSON.stringify(query)} fallback={<PeopleFallback />}>
          <People
            access={actor.access}
            actorId={actor.user.id}
            organizationId={organizationId}
            organizationName={organizationName}
            query={query}
          />
        </Suspense>
      ) : (
        <p className="rounded-[12px] border border-stone-hair bg-surface p-6 text-[13px] text-stone-mid">
          Choose an organization to see its people.
        </p>
      )}
    </main>
  );
}
