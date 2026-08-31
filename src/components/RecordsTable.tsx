import type { SampleRecord } from "@/domain";
import { ValidationStatus, formatConfidence, formatProcessingTime } from "@/domain";

/**
 * The detailed records table (SRS Module 4).
 *
 * Columns mirror the research-matrix export so what an admin reads on screen is
 * what lands in the file, plus the capture date and owner needed to make sense
 * of a row in context.
 *
 * Both EPG figures are shown side by side on purpose. The gap between what the
 * model counted and what the technologist confirmed is the number this console
 * exists to expose; showing only the validated figure would hide it.
 */

const STATUS_STYLE: Record<ValidationStatus, string> = {
  [ValidationStatus.Validated]: "bg-ok-tint text-ok",
  [ValidationStatus.Pending]: "bg-warn-tint text-warn",
  [ValidationStatus.Flagged]: "bg-danger-tint text-danger",
};

const STATUS_LABEL: Record<ValidationStatus, string> = {
  [ValidationStatus.Validated]: "Validated",
  [ValidationStatus.Pending]: "Pending",
  [ValidationStatus.Flagged]: "Flagged",
};

export function RecordsTable({ records }: { records: SampleRecord[] }) {
  if (records.length === 0) {
    return (
      <p className="rounded-[12px] border border-stone-hair bg-surface p-6 text-[13px] text-stone-mid">
        No samples match these filters.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[12px] border border-stone-hair">
      <table className="w-full min-w-[900px] border-collapse text-[13px]">
        <caption className="sr-only">
          Processed samples with model and technologist-validated results.
        </caption>
        <thead>
          <tr className="bg-background text-left">
            <Th>Sample ID</Th>
            <Th>Captured</Th>
            <Th>Technologist</Th>
            <Th>Status</Th>
            <Th>Detected species / class</Th>
            <Th align="right">AI confidence</Th>
            <Th align="right">AI EPG</Th>
            <Th align="right">Validated EPG</Th>
            <Th align="right">Processing time</Th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.sample.id} className="border-t border-stone-hair align-top">
              <td className="tnum px-3 py-2 font-medium text-stone-ink">
                {/* Enough of the UUID to identify a row without dominating it. */}
                {record.sample.id.slice(0, 8)}
                <span className="text-stone-soft">…</span>
              </td>
              <td className="tnum px-3 py-2 text-stone-deep">
                {record.sample.capturedAt.slice(0, 10)}
              </td>
              <td className="px-3 py-2 text-stone-deep">
                {record.owner?.fullName ?? (
                  <span className="text-stone-mid">
                    {record.sample.userId.slice(0, 8)}
                    <span className="text-stone-soft">…</span>
                  </span>
                )}
              </td>
              <td className="px-3 py-2">
                {/* Label plus tint — never the tint alone. */}
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[record.validationStatus]}`}
                >
                  {STATUS_LABEL[record.validationStatus]}
                </span>
              </td>
              <td className="px-3 py-2 text-stone-deep">
                {record.detectedSpecies.length > 0 ? (
                  record.detectedSpecies.join("; ")
                ) : (
                  <span className="text-stone-mid">No confirmed eggs</span>
                )}
              </td>
              <td className="tnum px-3 py-2 text-right text-stone-deep">
                {formatConfidence(record.meanConfidence) || (
                  <span className="text-stone-mid">—</span>
                )}
              </td>
              <td className="tnum px-3 py-2 text-right text-stone-mid">
                {record.aiEpg.toLocaleString()}
              </td>
              <td className="tnum px-3 py-2 text-right font-semibold text-stone-ink">
                {record.validatedEpg.toLocaleString()}
              </td>
              <td className="tnum px-3 py-2 text-right text-stone-deep">
                {formatProcessingTime(record.processingTimeMs) || (
                  <span className="text-stone-mid">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 font-semibold text-stone-deep ${align === "right" ? "text-right" : ""}`}
    >
      {children}
    </th>
  );
}
