import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  PERSON_STATUS_LABEL,
  PEOPLE_ROLE_FILTER_LABEL,
  ROLE_LABEL,
  canChangeMemberStatus,
  canManageInvitation,
  rowRole,
  type ConsoleAccess,
  type PeopleRoleFilter,
  type PeopleRow,
  type PeopleSort,
  type PersonStatus,
  type SortDirection,
} from "@/domain";
import { formatDate } from "@/lib/format";
import { pageLinks } from "@/lib/pagination";
import { InvitationActions } from "@/components/invitations/InvitationForms";
import { LinkPending } from "@/components/loading/LinkPending";
import { Badge } from "@/components/ui/badge";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MemberStatusForm } from "./MemberStatusForm";

/** The list's place in the URL, so a view can be shared and paging keeps the search. */
export interface PeopleQuery {
  org: string;
  q: string;
  role: PeopleRoleFilter;
  sort: PeopleSort;
  dir: SortDirection;
  page: number;
}

export function peopleHref(query: PeopleQuery, change: Partial<PeopleQuery> = {}): string {
  const next = { ...query, ...change };
  const params = new URLSearchParams();
  if (next.org) params.set("org", next.org);
  if (next.q) params.set("q", next.q);
  if (next.role !== "all") params.set("role", next.role);
  if (next.sort !== "name") params.set("sort", next.sort);
  if (next.dir !== "asc") params.set("dir", next.dir);
  if (next.page > 1) params.set("page", String(next.page));
  const search = params.toString();
  return search ? `/people?${search}` : "/people";
}

const BADGE: Record<PersonStatus, "ok" | "neutral" | "default" | "warn"> = {
  active: "ok",
  deactivated: "neutral",
  invited: "default",
  invite_expired: "warn",
};

const COLUMNS: { sort: PeopleSort; label: string; className?: string }[] = [
  { sort: "name", label: "Name" },
  { sort: "role", label: "Role" },
  { sort: "status", label: "Status" },
  { sort: "joined", label: "Joined" },
  { sort: "patients", label: "Patients", className: "text-right" },
];

function SortHeader({ query, column }: { query: PeopleQuery; column: (typeof COLUMNS)[number] }) {
  const active = query.sort === column.sort;
  const dir: SortDirection = active && query.dir === "asc" ? "desc" : "asc";
  const Icon = query.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={column.className}
      aria-sort={active ? (query.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <Link
        href={peopleHref(query, { sort: column.sort, dir, page: 1 })}
        className="inline-flex items-center gap-1 hover:text-stone-ink"
      >
        {column.label}
        {active ? <Icon className="size-3" aria-hidden /> : null}
      </Link>
    </TableHead>
  );
}

/**
 * Everyone in a laboratory — org admins and medtechs — and the people it has
 * invited, one page of them, with deactivate, reactivate, re-send and revoke
 * where this user may. The signed-in person's own row is marked.
 */
export function PeopleTable({
  rows,
  total,
  pages,
  query,
  access,
  actorId,
  organizationId,
  organizationName,
  lastOrgAdminId,
}: {
  rows: readonly PeopleRow[];
  total: number;
  pages: number;
  query: PeopleQuery;
  access: ConsoleAccess;
  actorId: string;
  organizationId: string;
  organizationName: string;
  /** The laboratory's only active org admin, whom nobody deactivates; null when there are more. */
  lastOrgAdminId: string | null;
}) {
  if (total === 0) {
    return (
      <p className="rounded-[12px] border border-stone-hair bg-surface p-6 text-[13px] text-stone-mid">
        {query.q
          ? `Nobody matches “${query.q}”.`
          : query.role !== "all"
            ? `${organizationName} has no ${PEOPLE_ROLE_FILTER_LABEL[query.role].toLowerCase()} yet.`
            : `${organizationName} has nobody yet.`}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Table className="min-w-[720px]">
        <TableCaption>People of {organizationName}</TableCaption>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((column) => (
              <SortHeader key={column.sort} query={query} column={column} />
            ))}
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const name = row.kind === "member" ? row.person.fullName : row.invitation.fullName;
            const email = row.kind === "member" ? row.person.email : row.invitation.email;
            return (
              <TableRow key={row.key}>
                {/* Name with the email beneath: one column for both keeps the actions on screen. */}
                <TableCell>
                  <div className="flex items-center gap-2 font-medium whitespace-nowrap text-stone-ink">
                    {row.kind === "member" ? (
                      <Link
                        href={`/people/${row.person.userId}${query.org ? `?org=${query.org}` : ""}`}
                        className="hover:text-maroon"
                      >
                        {name?.trim() || email || "Unnamed person"}
                        <LinkPending />
                      </Link>
                    ) : (
                      name?.trim() || <span className="text-stone-mid">—</span>
                    )}
                    {row.kind === "member" && row.person.userId === actorId ? (
                      <Badge variant="gold">You</Badge>
                    ) : null}
                  </div>
                  <div className="text-[12px] text-stone-mid">{email ?? "—"}</div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-stone-deep">
                  {ROLE_LABEL[rowRole(row)]}
                </TableCell>
                <TableCell>
                  <Badge variant={BADGE[row.status]}>{PERSON_STATUS_LABEL[row.status]}</Badge>
                </TableCell>
                <TableCell className="tnum whitespace-nowrap">
                  {row.kind === "member" ? (
                    formatDate(row.person.addedAt)
                  ) : (
                    <span className="text-stone-mid">
                      Invited {formatDate(row.invitation.invitedAt)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tnum">
                  {row.kind === "member" ? (
                    row.person.assignedPatients
                  ) : (
                    <span className="text-stone-mid">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {row.kind === "member" ? (
                    canChangeMemberStatus(access, actorId, organizationId, row.person) ? (
                      row.person.userId === lastOrgAdminId ? (
                        <span className="text-[12px] text-stone-mid">Only organization admin</span>
                      ) : (
                        <MemberStatusForm
                          organizationId={organizationId}
                          userId={row.person.userId}
                          name={name?.trim() || email || "this person"}
                          role={row.person.role}
                          status={row.person.status}
                        />
                      )
                    ) : (
                      <span className="text-stone-mid">—</span>
                    )
                  ) : canManageInvitation(access, row.invitation) ? (
                    <InvitationActions id={row.invitation.id} email={row.invitation.email} />
                  ) : (
                    <span className="text-stone-mid">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {pages > 1 ? (
        <Pagination>
          <PaginationContent>
            {query.page > 1 ? (
              <PaginationItem>
                <PaginationPrevious href={peopleHref(query, { page: query.page - 1 })} />
              </PaginationItem>
            ) : null}
            {pageLinks(query.page, pages).map((link, index) => (
              <PaginationItem key={link === "ellipsis" ? `gap-${index}` : link}>
                {link === "ellipsis" ? (
                  <PaginationEllipsis />
                ) : (
                  <PaginationLink
                    href={peopleHref(query, { page: link })}
                    isActive={link === query.page}
                  >
                    {link}
                  </PaginationLink>
                )}
              </PaginationItem>
            ))}
            {query.page < pages ? (
              <PaginationItem>
                <PaginationNext href={peopleHref(query, { page: query.page + 1 })} />
              </PaginationItem>
            ) : null}
          </PaginationContent>
        </Pagination>
      ) : null}
    </div>
  );
}
