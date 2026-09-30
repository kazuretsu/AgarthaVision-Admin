import { getDatabase } from "@/adapters/registry";
import { isValidatedRecord } from "@/domain";
import { MissingEnvironmentError } from "@/lib/env";
import { isEmptyFilter, parseRecordFilter, toSearchParams } from "@/lib/search-params";
import { RecordsFilters } from "@/components/RecordsFilters";
import { RecordsTable } from "@/components/RecordsTable";

/**
 * Detailed records dashboard (SRS Module 4).
 *
 * Filters arrive in the query string, are parsed once, and are handed to both
 * the table and the export links — so a downloaded file always matches the view
 * that produced it.
 */
export const dynamic = "force-dynamic";

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = toSearchParams(await searchParams);
  const filter = parseRecordFilter(params);

  let records;
  let owners;
  try {
    const db = await getDatabase();
    [records, owners] = await Promise.all([db.listSampleRecords({ filter }), db.listProfiles()]);
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return (
        <main className="mx-auto w-full max-w-6xl px-6 py-10">
          <h1 className="text-[22px] font-bold text-stone-ink">Records</h1>
          <p className="mt-3 text-[14px] text-stone-deep">
            <code className="font-mono text-[13px]">{cause.variable}</code> is not set, so no
            records could be read.
          </p>
        </main>
      );
    }
    throw cause;
  }

  const validatedCount = records.filter(isValidatedRecord).length;
  const exportQuery = params.toString();
  const href = (format: "csv" | "json", all = false) => {
    const query = new URLSearchParams(exportQuery);
    query.set("format", format);
    if (all) query.set("includeUnvalidated", "1");
    return `/records/export?${query.toString()}`;
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-[22px] font-bold text-stone-ink">Records</h1>
        <p className="text-[13px] text-stone-mid">
          {isEmptyFilter(filter) ? "All processed samples." : "Filtered view."}{" "}
          {records.length.toLocaleString()} shown, {validatedCount.toLocaleString()} validated.
        </p>
      </header>

      <RecordsFilters filter={filter} owners={owners} />

      <section className="flex flex-wrap items-center gap-3 rounded-[12px] border border-stone-hair bg-surface p-4">
        <div className="flex flex-col">
          <span className="text-[13px] font-semibold text-stone-ink">Research matrix export</span>
          <span className="text-[12px] text-stone-mid">
            Sample ID, detected species, AI confidence, AI EPG, validated EPG, processing time.
          </span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <a
            href={href("csv")}
            className="rounded-[8px] bg-maroon px-3 py-1.5 text-[13px] font-semibold text-primary-foreground"
          >
            CSV
          </a>
          <a
            href={href("json")}
            className="rounded-[8px] border border-stone-hair px-3 py-1.5 text-[13px] font-semibold text-stone-deep hover:border-maroon hover:text-maroon"
          >
            JSON
          </a>
          <a
            href={href("csv", true)}
            className="text-[12px] text-stone-mid underline-offset-4 hover:text-maroon hover:underline"
          >
            CSV including unvalidated
          </a>
        </div>
        <p className="w-full text-[12px] text-stone-mid">
          Exports contain validated records only. Pending and flagged samples are excluded from
          official aggregation; the third link produces a working file, not a report.
        </p>
      </section>

      <RecordsTable records={records} />
    </main>
  );
}
