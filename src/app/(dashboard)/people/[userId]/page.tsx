import Link from "next/link";
import { notFound } from "next/navigation";
import { getDatabase } from "@/adapters/registry";
import {
  canChangeMemberStatus,
  isLastActiveOrgAdmin,
  isUuid,
  memberPatientLabel,
  ROLE_LABEL,
} from "@/domain";
import { DatabaseReadError } from "@/ports/db";
import { MissingEnvironmentError } from "@/lib/env";
import { ANY_CONSOLE_USER, requirePageAccess } from "@/lib/console-access";
import { formatDate, personName } from "@/lib/format";
import { pageCount, pageLinks, pageOffset, parsePage } from "@/lib/pagination";
import { Breadcrumbs } from "@/components/records/Breadcrumbs";
import { DataUnavailable } from "@/components/records/DataUnavailable";
import { Fact } from "@/components/records/Fact";
import { MemberStatusForm } from "@/components/people/MemberStatusForm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

/**
 * One member of a laboratory — a medtech or an org admin, since both do fieldwork
 * (14zcqntkd0w) — and the laboratory's patients assigned to them. An org admin
 * opens their own laboratory's people; a super admin names the laboratory
 * (`?org=`) and reads the patients de-identified. Assignments change on the
 * patient's page.
 */
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

function param(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePageAccess(ANY_CONSOLE_USER);
  const { userId } = await params;
  const query = await searchParams;
  if (!isUuid(userId)) notFound();
  const organizationId =
    actor.access.kind === "org_admin" ? actor.access.organizationId : param(query.org);
  if (!isUuid(organizationId)) notFound();

  let people;
  let person;
  let patients;
  let changeable = false;
  // The patients only this person covers, which must be handed over before they can be
  // deactivated; read only for someone who could deactivate them.
  let soleCover = new Set<string>();
  try {
    const db = await getDatabase();
    people = await db.listPeople(organizationId);
    person = people.find((candidate) => candidate.userId === userId);
    if (!person) notFound();
    changeable = canChangeMemberStatus(actor.access, actor.user.id, organizationId, person);
    [patients, soleCover] = await Promise.all([
      db.listMemberPatients(userId),
      changeable && person.status === "active"
        ? db.listSoleCoverPatients(userId).then((ids) => new Set(ids))
        : Promise.resolve(new Set<string>()),
    ]);
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return <DataUnavailable title="Person" variable={cause.variable} />;
    }
    // A laboratory this user may not read names no one they may see.
    if (cause instanceof DatabaseReadError) notFound();
    throw cause;
  }

  const name = personName(person);
  const orgQuery = actor.access.kind === "super_admin" ? `?org=${organizationId}` : "";
  const pages = pageCount(patients.length, PAGE_SIZE);
  const page = Math.min(parsePage(param(query.page)), pages);
  const shown = patients.slice(
    pageOffset(page, PAGE_SIZE),
    pageOffset(page, PAGE_SIZE) + PAGE_SIZE,
  );
  const pageHref = (n: number) =>
    `/people/${userId}?${new URLSearchParams({
      ...(actor.access.kind === "super_admin" ? { org: organizationId } : {}),
      ...(n > 1 ? { page: String(n) } : {}),
    }).toString()}`.replace(/\?$/, "");

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <Breadcrumbs items={[{ label: "People", href: `/people${orgQuery}` }, { label: name }]} />

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] font-bold text-stone-ink">{name}</h1>
          <Badge variant="neutral">{ROLE_LABEL[person.role]}</Badge>
          {person.status === "active" ? (
            <Badge variant="ok">Active</Badge>
          ) : (
            <Badge variant="neutral">Deactivated</Badge>
          )}
        </div>
        {!changeable ? null : isLastActiveOrgAdmin(people, person.userId) ? (
          <p className="max-w-72 text-right text-[12px] text-stone-mid">
            The only active organization admin of this laboratory. Invite another before
            deactivating them.
          </p>
        ) : (
          <MemberStatusForm
            organizationId={organizationId}
            userId={person.userId}
            name={name}
            role={person.role}
            status={person.status}
          />
        )}
      </header>

      {soleCover.size > 0 ? (
        <p
          role="note"
          className="rounded-[12px] border border-stone-hair bg-warn-tint px-4 py-3 text-[13px] text-warn"
        >
          {name} is the only active member on {soleCover.size} patient
          {soleCover.size === 1 ? "" : "s"}, marked below. Hand{" "}
          {soleCover.size === 1 ? "it" : "them"} over on the patient&apos;s page before deactivating{" "}
          {name}: a patient always keeps an active member of its laboratory.
        </p>
      ) : null}

      <Card>
        <CardContent className="grid grid-cols-3 gap-4">
          <Fact label="Email" value={person.email ?? "—"} />
          <Fact label="Joined" value={formatDate(person.addedAt)} />
          <Fact label="Assigned patients" value={String(patients.length)} mono />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold text-stone-ink">Assigned patients</h2>
          <p className="text-[12px] text-stone-mid">
            {actor.access.kind === "org_admin"
              ? "To assign, remove or hand over a patient, open the patient."
              : "Patients are named by record id."}
          </p>
        </div>
        {patients.length === 0 ? (
          <p className="rounded-[12px] border border-stone-hair bg-surface p-6 text-[13px] text-stone-mid">
            {name} is not assigned to any patient.
          </p>
        ) : (
          <>
            <Table className="min-w-[560px]">
              <TableCaption>Patients assigned to {name}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Barangay PSGC</TableHead>
                  <TableHead>Assigned</TableHead>
                  {soleCover.size > 0 ? <TableHead>Cover</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((patient) => (
                  <TableRow key={patient.patientId}>
                    <TableCell>
                      <Link
                        href={`/records/patients/${patient.patientId}`}
                        className="font-semibold text-stone-ink hover:text-maroon"
                      >
                        {memberPatientLabel(patient)}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-[12px]">
                      {patient.psgcBarangayCode}
                    </TableCell>
                    <TableCell className="tnum">{formatDate(patient.linkedAt)}</TableCell>
                    {soleCover.size > 0 ? (
                      <TableCell>
                        {soleCover.has(patient.patientId) ? (
                          <Badge variant="warn">Only active member</Badge>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {pages > 1 ? (
              <Pagination>
                <PaginationContent>
                  {page > 1 ? (
                    <PaginationItem>
                      <PaginationPrevious href={pageHref(page - 1)} />
                    </PaginationItem>
                  ) : null}
                  {pageLinks(page, pages).map((link, index) => (
                    <PaginationItem key={link === "ellipsis" ? `gap-${index}` : link}>
                      {link === "ellipsis" ? (
                        <PaginationEllipsis />
                      ) : (
                        <PaginationLink href={pageHref(link)} isActive={link === page}>
                          {link}
                        </PaginationLink>
                      )}
                    </PaginationItem>
                  ))}
                  {page < pages ? (
                    <PaginationItem>
                      <PaginationNext href={pageHref(page + 1)} />
                    </PaginationItem>
                  ) : null}
                </PaginationContent>
              </Pagination>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
