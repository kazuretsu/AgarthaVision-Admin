import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { getDatabase } from "@/adapters/registry";
import {
  ageYears,
  isCodenamed,
  patientDisclosureFor,
  patientLabel,
  type OrganizationSummary,
  type PatientPage,
} from "@/domain";
import { MissingEnvironmentError } from "@/lib/env";
import { ANY_CONSOLE_USER, requirePageAccess } from "@/lib/console-access";
import { scopeForRequest } from "@/lib/read-scope";
import { OrganizationFilter } from "@/components/organizations/OrganizationFilter";
import { formatDate, personName } from "@/lib/format";
import { pageCount, pageLinks, pageOffset, pageRange, parsePage } from "@/lib/pagination";
import { DataUnavailable } from "@/components/records/DataUnavailable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
 * Records, entered by patient: Patient → Session → Sample.
 *
 * Read-only. The search lives in the query string, so a view can be shared. Row
 * visibility is decided by the database as the signed-in user.
 *
 * A super admin sees patients de-identified (`patientDisclosureFor`): no name,
 * sex or age column, and no name search, since a match would reveal a name.
 *
 * Read one page at a time (`?page=`), with the number that match in all, so a
 * laboratory past one response's row cap can still reach every patient. Search
 * and filters run in the database, over every patient in scope.
 */
export const dynamic = "force-dynamic";

/** Patients per page. Well under PostgREST's 1000-row response cap. */
const PAGE_SIZE = 50;

function param(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

/** "Showing 51–100 of 1,234 patients", or just the count when it fits one page. */
function countLine(
  shown: { first: number; last: number },
  total: number,
  pages: number,
  filtered: boolean,
): string {
  const count = `${total.toLocaleString()} ${total === 1 ? "patient" : "patients"}`;
  if (pages === 1)
    return filtered ? `${count} ${total === 1 ? "matches" : "match"} this search` : count;
  const range = `Showing ${shown.first.toLocaleString()}–${shown.last.toLocaleString()} of`;
  return filtered ? `${range} ${total.toLocaleString()} matching patients` : `${range} ${count}`;
}

/** The list URL for `page`, keeping the search and the laboratory chosen. */
function listHref(filters: { q: string; barangay: string; org: string }, page: number): string {
  const query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  if (filters.barangay) query.set("barangay", filters.barangay);
  if (filters.org) query.set("org", filters.org);
  if (page > 1) query.set("page", String(page));
  const text = query.toString();
  return text ? `/records?${text}` : "/records";
}

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The layout is not re-rendered on a client-side navigation, so the page
  // repeats the check: a revoked admin loses access on their next click.
  const actor = await requirePageAccess(ANY_CONSOLE_USER);
  const disclosure = patientDisclosureFor(actor.access);
  const identified = disclosure === "identified";

  const params = await searchParams;
  const search = identified ? param(params.q) : "";
  const barangay = param(params.barangay);
  const page = parsePage(param(params.page));
  const { scope } = await scopeForRequest(params.org);
  const filters = {
    q: search,
    barangay,
    org:
      actor.access.kind === "super_admin" && scope.kind === "organization"
        ? scope.organizationId
        : "",
  };

  let patients: PatientPage;
  let organizations: OrganizationSummary[] = [];
  try {
    const db = await getDatabase();
    [patients, organizations] = await Promise.all([
      db.listPatients({
        scope,
        disclosure,
        search,
        barangayCode: barangay || undefined,
        offset: pageOffset(page, PAGE_SIZE),
        limit: PAGE_SIZE,
      }),
      actor.access.kind === "super_admin" ? db.listOrganizations() : Promise.resolve([]),
    ]);
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return <DataUnavailable title="Records" variable={cause.variable} />;
    }
    throw cause;
  }

  // A page past the end (a stale link, or a search narrowed since) goes to the last one.
  // The list's loading state has already started the response, so this redirect lands
  // in the browser rather than as a 307 (docs/map/effects/CONTEXT.md).
  const pages = pageCount(patients.total, PAGE_SIZE);
  if (patients.items.length === 0 && page > pages) redirect(listHref(filters, pages));
  const shown = pageRange(page, PAGE_SIZE, patients.total);

  const now = new Date();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-[22px] font-bold text-stone-ink">Records</h1>
        <p className="text-[13px] text-stone-mid">
          Patients and every smear read for them, as the mobile app reports them. Read-only.
          {identified
            ? null
            : " Patients are de-identified: names, sex and birthdates stay with their laboratory."}
        </p>
      </header>

      <form className="flex flex-wrap items-end gap-3" role="search">
        {identified ? (
          <label className="flex min-w-56 flex-1 flex-col gap-1.5">
            <span className="text-[12px] font-medium text-stone-deep">Name or codename</span>
            <Input name="q" defaultValue={search} placeholder="e.g. Dela Cruz or M24-001" />
          </label>
        ) : null}
        <label className="flex w-48 flex-col gap-1.5">
          <span className="text-[12px] font-medium text-stone-deep">Barangay PSGC code</span>
          <Input
            name="barangay"
            defaultValue={barangay}
            inputMode="numeric"
            pattern="[0-9]{10}"
            placeholder="10 digits"
          />
        </label>
        {actor.access.kind === "super_admin" ? (
          <OrganizationFilter organizations={organizations} scope={scope} />
        ) : null}
        <Button type="submit">
          <Search aria-hidden /> Search
        </Button>
        {search ||
        barangay ||
        (actor.access.kind === "super_admin" && scope.kind === "organization") ? (
          <Link href="/records" className="text-[13px] text-stone-mid hover:text-maroon">
            Clear
          </Link>
        ) : null}
      </form>

      {shown ? (
        <p className="tnum text-[13px] text-stone-mid">
          {countLine(shown, patients.total, pages, Boolean(search || barangay))}
        </p>
      ) : null}

      {patients.items.length === 0 ? (
        <p className="rounded-[12px] border border-stone-hair bg-surface p-6 text-[13px] text-stone-mid">
          {search || barangay ? "No patients match this search." : "No patients yet."}
        </p>
      ) : (
        <Table className="min-w-[760px]">
          <TableCaption>Patients, most recently registered first</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Patient</TableHead>
              {identified ? (
                <>
                  <TableHead>Sex</TableHead>
                  <TableHead>Age</TableHead>
                </>
              ) : null}
              <TableHead>Barangay</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
              <TableHead>Last session</TableHead>
              <TableHead>Registered by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {patients.items.map(({ patient, registeredBy, sessionCount, lastSessionAt }) => (
              <TableRow key={patient.id} className="hover:bg-surface-sunken">
                <TableCell>
                  <Link
                    href={`/records/patients/${patient.id}`}
                    className="font-semibold text-stone-ink hover:text-maroon"
                  >
                    {patientLabel(patient)}
                  </Link>
                  {patient.identity && isCodenamed(patient.identity) ? (
                    <Badge variant="neutral" className="ml-2">
                      Codename
                    </Badge>
                  ) : null}
                </TableCell>
                {patient.identity ? (
                  <>
                    <TableCell>{patient.identity.sex}</TableCell>
                    <TableCell className="tnum">
                      {ageYears(patient.identity.birthdate, now)}
                    </TableCell>
                  </>
                ) : null}
                <TableCell className="tnum">{patient.psgcBarangayCode}</TableCell>
                <TableCell className="tnum text-right">{sessionCount}</TableCell>
                <TableCell className="tnum">{formatDate(lastSessionAt)}</TableCell>
                <TableCell>{personName(registeredBy)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {pages > 1 ? (
        <Pagination>
          <PaginationContent>
            {page > 1 ? (
              <PaginationItem>
                <PaginationPrevious href={listHref(filters, page - 1)} />
              </PaginationItem>
            ) : null}
            {pageLinks(page, pages).map((link, index) => (
              <PaginationItem key={link === "ellipsis" ? `gap-${index}` : link}>
                {link === "ellipsis" ? (
                  <PaginationEllipsis />
                ) : (
                  <PaginationLink
                    href={listHref(filters, link)}
                    isActive={link === page}
                    aria-label={`Page ${link}`}
                  >
                    {link}
                  </PaginationLink>
                )}
              </PaginationItem>
            ))}
            {page < pages ? (
              <PaginationItem>
                <PaginationNext href={listHref(filters, page + 1)} />
              </PaginationItem>
            ) : null}
          </PaginationContent>
        </Pagination>
      ) : null}
    </main>
  );
}
