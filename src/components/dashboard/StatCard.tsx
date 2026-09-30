import { Card } from "@/components/ui/card";

/**
 * A single headline number. A lone magnitude is a stat, not a chart — there is
 * nothing to compare along an axis, so a plot would be decoration.
 */
export function StatCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card className="gap-1 p-4">
      <span className="text-[11px] font-semibold tracking-[0.12em] text-stone-mid uppercase">
        {label}
      </span>
      <span className="tnum text-[26px] leading-8 font-bold text-stone-ink">{value}</span>
      {note ? <span className="text-[12px] leading-4 text-stone-mid">{note}</span> : null}
    </Card>
  );
}
