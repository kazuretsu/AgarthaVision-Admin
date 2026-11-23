import { Card, CardContent } from "@/components/ui/card";
import { TOO_MANY_ATTEMPTS } from "@/domain/attempt-limits";
import { checkedSpeciesRows, reportTypeLabel, type CheckedReport } from "@/domain/report-check";
import { formatDateTime } from "@/lib/format";
import type { ReportCheckPageState } from "@/lib/report-check";

/**
 * What `/verify/report` shows for a report's QR link (14zcqnty9bj). The reader is a doctor or
 * a patient holding the paper, not a console user, so the page names no patient and no medtech
 * (constraint #14): it confirms the record exists and shows its stored findings to compare.
 */
export function ReportCheckView({ state }: { state: ReportCheckPageState }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-stone-mid uppercase">
          AgarthaVision
        </p>
        <h1 className="text-[26px] leading-8 font-bold text-stone-ink">Report check</h1>
      </div>
      {state.kind === "confirmed" ? (
        <Confirmed report={state.report} />
      ) : (
        <Notice {...NOTICES[state.kind]} />
      )}
    </main>
  );
}

const NOTICES: Record<
  Exclude<ReportCheckPageState["kind"], "confirmed">,
  { title: string; body: string }
> = {
  mismatch: {
    title: "This report can't be confirmed.",
    body:
      "The code does not match the laboratory's record, so the link or the printed code may " +
      "have been altered. Ask the laboratory that issued the report.",
  },
  not_found: {
    title: "No report matches this code.",
    body:
      "A report made while the phone was offline appears here once the phone has synced. If " +
      "it still does not, ask the laboratory that issued the report.",
  },
  too_many: { title: TOO_MANY_ATTEMPTS, body: "Scan the code again after the wait." },
  unavailable: {
    title: "This report could not be checked right now.",
    body: "Try again in a moment.",
  },
};

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 text-[14px] text-stone-deep">
        <p role="alert" className="font-semibold text-stone-ink">
          {title}
        </p>
        <p>{body}</p>
      </CardContent>
    </Card>
  );
}

function Confirmed({ report }: { report: CheckedReport }) {
  const species = checkedSpeciesRows(report);
  const facts: [string, string][] = [
    ["Laboratory", report.laboratoryName ?? "Not recorded"],
    ["Report", reportTypeLabel(report.reportType)],
    ["Generated", formatDateTime(report.generatedAt)],
    ["Fields examined", String(report.totalSamples)],
    ["Eggs confirmed", String(report.totalEggsConfirmed)],
  ];
  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-4 text-[14px] text-stone-deep">
          <div className="flex flex-col gap-1">
            <p role="status" className="font-semibold text-stone-ink">
              This report is in AgarthaVision&apos;s records.
            </p>
            <p>
              Compare the findings below with the printed report. If they differ, the printed copy
              was changed after it was made.
            </p>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            {facts.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-stone-mid">{label}</dt>
                <dd className="text-stone-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-2">
            <h2 className="text-[12px] font-semibold tracking-[0.08em] text-stone-mid uppercase">
              Findings
            </h2>
            {species.length === 0 ? (
              <p className="text-stone-ink">No parasites found.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {species.map((row) => (
                  <li key={row.species} className="flex justify-between gap-4">
                    <span className="text-stone-ink">{row.species}</span>
                    <span className="tabular-nums">{row.range}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
      <p className="-mt-4 text-[13px] text-stone-mid">
        This page shows no patient details. For anything else about the report, ask the laboratory
        that issued it.
      </p>
    </>
  );
}
