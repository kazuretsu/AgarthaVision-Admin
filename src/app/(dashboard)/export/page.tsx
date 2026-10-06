import Link from "next/link";
import { Suspense } from "react";
import { Download } from "lucide-react";
import { getDatabase } from "@/adapters/registry";
import {
  RESEARCH_EXPORT_COLUMNS,
  RESEARCH_EXPORT_LIMIT,
  patientDisclosureFor,
  type ConsoleAccess,
  type OrganizationSummary,
  type ReadScope,
} from "@/domain";
import { ANY_CONSOLE_USER, requirePageAccess } from "@/lib/console-access";
import { MissingEnvironmentError } from "@/lib/env";
import { describePeriod, parsePeriod, type Period } from "@/lib/period";
import { scopeForRequest } from "@/lib/read-scope";
import { OrganizationFilter } from "@/components/organizations/OrganizationFilter";
import { DataUnavailable } from "@/components/records/DataUnavailable";
import { ExportBodySkeleton } from "@/components/loading/PageSkeletons";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * The research export: one row per examined smear, in LPF terms, with no names
 * and no birthdates. The page shows how many smears the file will hold before it
 * is downloaded, counted in the database in one request (admin/0011) rather than by
 * reading every row. The count reads inside a Suspense boundary keyed by the period,
 * so the form shows first and every new period shows the count's skeleton.
 */
export const dynamic = "force-dynamic";

/** How many smears the file will hold, and the download links. */
async function ExportCount({
  access,
  scope,
  period,
  query,
}: {
  access: ConsoleAccess;
  scope: ReadScope;
  period: Period;
  query: string;
}) {
  let totals;
  try {
    totals = await (
      await getDatabase()
    ).dashboardTotals({
      scope,
      disclosure: patientDisclosureFor(access),
      startedFrom: period.from,
      startedTo: period.to,
    });
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return (
        <p className="text-[13px] text-stone-deep">
          <code className="font-mono">{cause.variable}</code> is not set, so nothing could be read.
        </p>
      );
    }
    throw cause;
  }

  // The download refuses a period over its limit in sessions, read or not; say so first.
  const tooLarge = totals.sessions > RESEARCH_EXPORT_LIMIT;
  const examined = totals.smearsExamined;
  const href = (format: "csv" | "json") => {
    const params = new URLSearchParams(query);
    params.set("format", format);
    return `/export/download?${params.toString()}`;
  };

  return (
    <>
      {tooLarge ? (
        <p role="status" className="rounded-[10px] bg-warn-tint px-4 py-2 text-[13px] text-warn">
          This period holds more than {RESEARCH_EXPORT_LIMIT.toLocaleString()} sessions, more than
          one file may hold. Narrow the period to export it.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[14px] text-stone-ink">
          <span className="tnum font-bold">{examined.toLocaleString()}</span> smear
          {examined === 1 ? "" : "s"} examined, {describePeriod(period)}.
        </p>
        <div className="ml-auto flex gap-2">
          <a href={href("csv")} className={buttonVariants()}>
            <Download aria-hidden /> CSV
          </a>
          <a href={href("json")} className={buttonVariants({ variant: "outline" })}>
            <Download aria-hidden /> JSON
          </a>
        </div>
      </div>
    </>
  );
}

export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The layout is not re-rendered on a client-side navigation, so the page
  // repeats the check: a revoked admin loses access on their next click.
  await requirePageAccess(ANY_CONSOLE_USER);

  const params = await searchParams;
  const period = parsePeriod(params);
  const { actor, scope } = await scopeForRequest(params.org);

  let organizations: OrganizationSummary[] = [];
  try {
    if (actor.access.kind === "super_admin") {
      organizations = await (await getDatabase()).listOrganizations();
    }
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return <DataUnavailable title="Export" variable={cause.variable} />;
    }
    throw cause;
  }

  const query = new URLSearchParams();
  if (period.from) query.set("from", period.from);
  if (period.to) query.set("to", period.to);
  if (scope.kind === "organization" && actor.access.kind === "super_admin") {
    query.set("org", scope.organizationId);
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-[22px] font-bold text-stone-ink">Research export</h1>
        <p className="text-[13px] text-stone-mid">
          One row per smear examined, with each species&apos; LPF range, descriptor and eggs
          counted. Patients appear only as a record ID, with their barangay code — no names and no
          birthdates. Each download is recorded in the audit trail.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Period</CardTitle>
          <CardDescription>By the day each session started, Philippine time.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <form className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-stone-deep">From</span>
              <Input type="date" name="from" defaultValue={period.from} className="w-40" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-stone-deep">To</span>
              <Input type="date" name="to" defaultValue={period.to} className="w-40" />
            </label>
            {actor.access.kind === "super_admin" ? (
              <OrganizationFilter organizations={organizations} scope={scope} />
            ) : null}
            <Button type="submit" variant="outline">
              Apply
            </Button>
            {period.from || period.to || params.org ? (
              <Link href="/export" className="px-2 text-[13px] text-stone-mid hover:text-maroon">
                Reset
              </Link>
            ) : null}
          </form>

          <Suspense key={query.toString()} fallback={<ExportBodySkeleton />}>
            <ExportCount
              access={actor.access}
              scope={scope}
              period={period}
              query={query.toString()}
            />
          </Suspense>
        </CardContent>
      </Card>

      <details className="text-[13px]">
        <summary className="cursor-pointer text-stone-mid hover:text-maroon">
          Columns ({RESEARCH_EXPORT_COLUMNS.length})
        </summary>
        <ol className="mt-2 list-decimal pl-6 text-stone-deep">
          {RESEARCH_EXPORT_COLUMNS.map((column) => (
            <li key={column}>{column}</li>
          ))}
        </ol>
      </details>
    </main>
  );
}
