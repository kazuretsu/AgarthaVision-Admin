import { getDatabase } from "@/adapters/registry";
import {
  epgTrend,
  severitySplit,
  speciesDistribution,
  summariseDashboard,
  summariseEpg,
} from "@/domain";
import { MissingEnvironmentError } from "@/lib/env";
import { StatTile } from "@/components/StatTile";
import { EpgTrendChart } from "@/components/charts/EpgTrendChart";
import { SeveritySplit } from "@/components/charts/SeveritySplit";
import { SpeciesDistribution } from "@/components/charts/SpeciesDistribution";

/**
 * Administrative dashboard (SDD §3.2).
 *
 * Every aggregate below counts validated records only. Pending and flagged
 * samples are excluded by the domain functions, not filtered here — one
 * definition, applied in one place, so this page and an export cannot disagree
 * about the same period.
 */
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let records;
  try {
    records = await (await getDatabase()).listSampleRecords();
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return (
        <main className="mx-auto w-full max-w-6xl px-6 py-10">
          <h1 className="text-[22px] font-bold text-stone-ink">Dashboard</h1>
          <p className="mt-3 text-[14px] text-stone-deep">
            <code className="font-mono text-[13px]">{cause.variable}</code> is not set, so no data
            could be read.
          </p>
        </main>
      );
    }
    throw cause;
  }

  const summary = summariseDashboard(records);
  const epg = summariseEpg(records);
  const trend = epgTrend(records);
  const distribution = speciesDistribution(records);
  const split = severitySplit(records);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-[22px] font-bold text-stone-ink">Dashboard</h1>
        <p className="text-[13px] text-stone-mid">
          Aggregates cover human-validated samples only. Pending and flagged records are excluded
          from every figure on this page.
        </p>
      </header>

      <section aria-label="System summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Samples processed"
          value={summary.totalSamplesProcessed.toLocaleString()}
          note="All records in scope"
        />
        <StatTile
          label="Pending validation"
          value={summary.pendingValidation.toLocaleString()}
          note="Excluded from aggregation"
          tone="muted"
        />
        <StatTile
          label="Positive samples"
          value={summary.positiveSamples.toLocaleString()}
          note="At least one confirmed egg"
        />
        <StatTile
          label="Positivity rate"
          value={`${Math.round(summary.positivityRate * 100)}%`}
          note={`of ${epg.sampleCount.toLocaleString()} validated`}
        />
      </section>

      <section aria-label="EPG trend" className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-stone-ink">Eggs per gram over time</h2>
        <EpgTrendChart points={trend} />
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-label="Parasite distribution" className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold text-stone-ink">Parasite distribution</h2>
          <SpeciesDistribution slices={distribution} />
        </section>

        <section aria-label="Infection intensity" className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold text-stone-ink">Infection intensity</h2>
          <SeveritySplit split={split} />
        </section>
      </div>

      <section aria-label="EPG summary" className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Average EPG" value={epg.averageEpg.toLocaleString()} />
        <StatTile label="Highest EPG" value={epg.highestEpg.toLocaleString()} />
        <StatTile label="Lowest EPG" value={epg.lowestEpg.toLocaleString()} />
      </section>
    </main>
  );
}
