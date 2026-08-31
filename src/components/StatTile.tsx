/**
 * A single headline number.
 *
 * The form heuristic says a lone magnitude is a stat tile, not a chart — there
 * is nothing to compare along an axis, so a plot would be decoration.
 */
export function StatTile({
  label,
  value,
  note,
  tone = "default",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "default" | "muted";
}) {
  return (
    <div className="flex flex-col gap-1 rounded-[12px] border border-stone-hair bg-surface p-4">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-mid">
        {label}
      </span>
      <span
        className={`tnum text-[26px] font-bold leading-8 ${
          tone === "muted" ? "text-stone-mid" : "text-stone-ink"
        }`}
      >
        {value}
      </span>
      {note ? <span className="text-[12px] leading-4 text-stone-mid">{note}</span> : null}
    </div>
  );
}
