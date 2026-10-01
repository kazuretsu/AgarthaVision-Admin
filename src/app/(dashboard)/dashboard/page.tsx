import Link from "next/link";
import { getDatabase } from "@/adapters/registry";
import { summariseDashboard } from "@/domain";
import { MissingEnvironmentError } from "@/lib/env";
import { ANY_CONSOLE_USER, requirePageAccess } from "@/lib/console-access";
import { describePeriod, parsePeriod } from "@/lib/period";
import { DataUnavailable } from "@/components/records/DataUnavailable";
import { SpeciesMix } from "@/components/dashboard/SpeciesMix";
import { StatCard } from "@/components/dashboard/StatCard";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * The landing dashboard, counted per smear on the app's rule.
 *
 * Every figure comes from `summariseDashboard`: a smear is examined once a live
 * field was verified and positive when a live field carries a counted detection —
 * the rule `barangay_prevalence()` uses, so this page and the map agree. No EPG
 * and no WHO intensity tier; both were retracted for direct smear.
 */
export const dynamic = "force-dynamic";

/** Sessions read for one dashboard. Reaching it means the figures would be partial. */
const SMEAR_LIMIT = 5000;

function percent(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The layout is not re-rendered on a client-side navigation, so the page
  // repeats the check: a revoked admin loses access on their next click.
  await requirePageAccess(ANY_CONSOLE_USER);

  const period = parsePeriod(await searchParams);

  let smears;
  try {
    smears = await (
      await getDatabase()
    ).listSmears({ startedFrom: period.from, startedTo: period.to, limit: SMEAR_LIMIT + 1 });
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return <DataUnavailable title="Dashboard" variable={cause.variable} />;
    }
    throw cause;
  }

  // One past the limit was asked for, so "more than the limit" is observable.
  const truncated = smears.length > SMEAR_LIMIT;
  if (truncated) smears = smears.slice(0, SMEAR_LIMIT);
  const figures = summariseDashboard(smears);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
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
          <Button type="submit" variant="outline">
            Apply
          </Button>
          {period.from || period.to ? (
            <Link href="/dashboard" className="px-2 text-[13px] text-stone-mid hover:text-maroon">
              All time
            </Link>
          ) : null}
        </form>
      </header>

      {truncated ? (
        <p role="status" className="rounded-[10px] bg-warn-tint px-4 py-2 text-[13px] text-warn">
          This period holds more than {SMEAR_LIMIT.toLocaleString()} sessions, so these figures
          cover only the most recent ones. Narrow the period for complete figures.
        </p>
      ) : null}

      <section aria-label="Summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
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
    </main>
  );
}
