import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ageYears,
  isCodenamed,
  patientLabel,
  type PatientDisclosure,
  type ReadScope,
} from "@/domain";
import type { DatabasePort } from "@/ports/db";
import { formatDate, personName } from "@/lib/format";
import { pageCount, pageLinks, pageOffset, pageRange } from "@/lib/pagination";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Patients per page. Well under PostgREST's 1000-row response cap. */
const PAGE_SIZE = 50;

/** What the list shows: the search, the laboratory chosen, and the page. */
export interface PatientListQuery {
  scope: ReadScope;
  disclosure: PatientDisclosure;
  /** Name or codename; always empty for a de-identified reader. */
  q: string;
  barangay: string;
  /** The laboratory a super admin chose, kept in page links; empty otherwise. */
  org: string;
  page: number;
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
function listHref(filters: Pick<PatientListQuery, "q" | "barangay" | "org">, page: number): string {
  const query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  if (filters.barangay) query.set("barangay", filters.barangay);
  if (filters.org) query.set("org", filters.org);
  if (page > 1) query.set("page", String(page));
  const text = query.toString();
  return text ? `/records?${text}` : "/records";
}

/**
 * One page of the records list: the count, the table and the page links. The page renders
 * it inside a Suspense boundary keyed by its query, so a new search or page shows
 * {@link PatientListFallback} in its place while the search form stays on screen.
 */
export async function PatientList({ db, query }: { db: DatabasePort; query: PatientListQuery }) {
  const { scope, disclosure, q: search, barangay, page } = query;
  const identified = disclosure === "identified";
  const patients = await db.listPatients({
    scope,
    disclosure,
    search,
    barangayCode: barangay || undefined,
    offset: pageOffset(page, PAGE_SIZE),
    limit: PAGE_SIZE,
  });

  // A page past the end (a stale link, or a search narrowed since) goes to the last one.
  // The list's loading state has already started the response, so this redirect lands
  // in the browser rather than as a 307 (docs/map/effects/CONTEXT.md).
  const pages = pageCount(patients.total, PAGE_SIZE);
  if (patients.items.length === 0 && page > pages) redirect(listHref(query, pages));
  const shown = pageRange(page, PAGE_SIZE, patients.total);

  const now = new Date();

  return (
    <>
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
                <PaginationPrevious href={listHref(query, page - 1)} />
              </PaginationItem>
            ) : null}
            {pageLinks(page, pages).map((link, index) => (
              <PaginationItem key={link === "ellipsis" ? `gap-${index}` : link}>
                {link === "ellipsis" ? (
                  <PaginationEllipsis />
                ) : (
                  <PaginationLink
                    href={listHref(query, link)}
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
                <PaginationNext href={listHref(query, page + 1)} />
              </PaginationItem>
            ) : null}
          </PaginationContent>
        </Pagination>
      ) : null}
    </>
  );
}

/** Stands in for the count, the table and the page links while a page of patients reads. */
export function PatientListFallback() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading patients…</span>
      <Skeleton className="h-4 w-56" />
      <div className="flex flex-col gap-3 rounded-[12px] border border-stone-hair bg-surface p-4">
        <Skeleton className="h-4 w-full" />
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}
