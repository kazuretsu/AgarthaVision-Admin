import Link from "next/link";
import { Suspense } from "react";
import { getDatabase } from "@/adapters/registry";
import {
  figuresFromTotals,
  patientDisclosureFor,
  type ConsoleAccess,
  type OrganizationSummary,
  type ReadScope,
} from "@/domain";
import { MissingEnvironmentError } from "@/lib/env";
import { ANY_CONSOLE_USER, requirePageAccess } from "@/lib/console-access";
import { describePeriod, parsePeriod, type Period } from "@/lib/period";
import { scopeForRequest } from "@/lib/read-scope";
import { OrganizationFilter } from "@/components/organizations/OrganizationFilter";
import { DataUnavailable } from "@/components/records/DataUnavailable";
import { DashboardBodySkeleton } from "@/components/loading/PageSkeletons";
import { SpeciesMix } from "@/components/dashboard/SpeciesMix";
import { StatCard } from "@/components/dashboard/StatCard";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * The landing dashboard, counted per smear on the app's rule.
 *
 * The counts come from the database in one request (`console_dashboard_figures()`,
 * admin/0011), whatever the period holds, on `summariseDashboard`'s rules: a smear
 * is examined once a live field was verified and positive when a live field carries
 * a counted detection — the rule `barangay_prevalence()` uses, so this page and the
 * map agree. No EPG and no WHO intensity tier; both were retracted for direct smear.
 *
 * The header and filters render first; the figures read inside a Suspense
 * boundary keyed by the filters, so the first visit and every new period show
 * their skeleton (`loading.tsx` covers only the first).
 */
export const dynamic = "force-dynamic";

function percent(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

/** The figures for one period and scope, streamed into their skeleton. */
async function DashboardFigures({
  access,
  scope,
  period,
}: {
  access: ConsoleAccess;
  scope: ReadScope;
  period: Period;
}) {
  let figures;
  try {
    figures = figuresFromTotals(
      await (
        await getDatabase()
      ).dashboardTotals({
        scope,
        disclosure: patientDisclosureFor(access),
        startedFrom: period.from,
        startedTo: period.to,
      }),
    );
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

  return (
    <>
      <section aria-label="Summary" className="grid grid-cols-5 gap-3">
        <StatCard
          label="Patients"
          value={figures.patients.toLocaleString()}
          note="With a smear read"
        />
        <StatCard label="Smears examined" value={figures.smearsExamined.toLocaleString()} />
        <StatCard label="Positive smears" value={figures.positiveSmears.toLocaleString()} />
        <StatCard
          label="Positive rate"
          value={percent(figures.positiveRate)}
          note={`of ${figures.smearsExamined.toLocaleString()} examined`}
        />
        <StatCard
          label="Fields verified"
          value={figures.fieldsVerified.toLocaleString()}
          note="Deleted duplicates excluded"
        />
      </section>

      <div className="grid grid-cols-[2fr_1fr] gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Smears per week</CardTitle>
            <CardDescription>Weeks start on Monday, Philippine time.</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart points={figures.trend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Species in positive smears</CardTitle>
            <CardDescription>
              Share of positive smears carrying each species. A smear with two species counts for
              both.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SpeciesMix rows={figures.speciesMix} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default async function DashboardPage({
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
      return <DataUnavailable title="Dashboard" variable={cause.variable} />;
    }
    throw cause;
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] font-bold text-stone-ink">Dashboard</h1>
          <p className="text-[13px] text-stone-mid">
            Smears read {describePeriod(period)}. A smear is one session; it counts once a field was
            verified, and is positive when any egg was counted.
          </p>
        </div>
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
            <Link href="/dashboard" className="px-2 text-[13px] text-stone-mid hover:text-maroon">
              Reset
            </Link>
          ) : null}
        </form>
      </header>

      <Suspense key={JSON.stringify({ period, scope })} fallback={<DashboardBodySkeleton />}>
        <DashboardFigures access={actor.access} scope={scope} period={period} />
      </Suspense>
    </main>
  );
}
