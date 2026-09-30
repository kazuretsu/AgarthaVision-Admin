import Link from "next/link";
import { Download } from "lucide-react";
import { getDatabase } from "@/adapters/registry";
import { RESEARCH_EXPORT_COLUMNS, isExamined } from "@/domain";
import { MissingEnvironmentError } from "@/lib/env";
import { describePeriod, parsePeriod } from "@/lib/period";
import { DataUnavailable } from "@/components/records/DataUnavailable";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * The research export: one row per examined smear, in LPF terms, with no names
 * and no birthdates. The page shows how many smears the file will hold before it
 * is downloaded.
 */
export const dynamic = "force-dynamic";

export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const period = parsePeriod(await searchParams);

  let smears;
  try {
    smears = await (
      await getDatabase()
    ).listSmears({ startedFrom: period.from, startedTo: period.to });
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return <DataUnavailable title="Export" variable={cause.variable} />;
    }
    throw cause;
  }

  const examined = smears.filter(isExamined).length;
  const query = new URLSearchParams();
  if (period.from) query.set("from", period.from);
  if (period.to) query.set("to", period.to);
  const href = (format: "csv" | "json") => {
    const params = new URLSearchParams(query);
    params.set("format", format);
    return `/export/download?${params.toString()}`;
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[22px] font-bold text-stone-ink">Research export</h1>
        <p className="text-[13px] text-stone-mid">
          One row per smear examined, with each species&apos; LPF range, descriptor and eggs
          counted. Patients appear only as a record ID, with their barangay code — no names and no
          birthdates.
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
            <Button type="submit" variant="outline">
              Apply
            </Button>
            {period.from || period.to ? (
              <Link href="/export" className="px-2 text-[13px] text-stone-mid hover:text-maroon">
                All time
              </Link>
            ) : null}
          </form>

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
