import type { SeveritySplit as Split } from "@/domain";
import { EpgSeverity } from "@/domain";
import { SEVERITY_COLOR, SEVERITY_LABEL, SEVERITY_ORDER } from "@/lib/palette";

/**
 * Light / moderate / heavy infection split across validated samples.
 *
 * Rendered with the reserved status palette rather than categorical hues,
 * because this is a clinical status scale. Status color never travels alone, so
 * every band shows its label and count; the swatch is confirmation, not the
 * message.
 *
 * `Unclassified` is kept as its own band rather than folded into `Light`. It
 * means a positive sample whose species has no published intensity threshold —
 * an honest gap, not a mild infection.
 */
export function SeveritySplit({ split }: { split: Split }) {
  const bands = SEVERITY_ORDER.map((severity) => ({
    severity,
    count:
      severity === EpgSeverity.None
        ? split.none
        : severity === EpgSeverity.Light
          ? split.light
          : severity === EpgSeverity.Moderate
            ? split.moderate
            : severity === EpgSeverity.Heavy
              ? split.heavy
              : split.unclassified,
  })).filter((band) => band.count > 0);

  if (split.total === 0) {
    return (
      <p className="text-[13px] text-stone-mid">
        No validated samples in this period, so no intensity split can be reported.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 2px surface gaps between segments, per the mark spec. */}
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
        {bands.map((band) => (
          <div
            key={band.severity}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(band.count / split.total) * 100}%`,
              background: SEVERITY_COLOR[band.severity],
            }}
          />
        ))}
      </div>
      <ul className="flex list-none flex-wrap gap-x-5 gap-y-2 p-0">
        {bands.map((band) => (
          <li key={band.severity} className="flex items-center gap-1.5 text-[13px]">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: SEVERITY_COLOR[band.severity] }}
            />
            <span className="text-stone-deep">{SEVERITY_LABEL[band.severity]}</span>
            <span className="tnum font-semibold text-stone-ink">{band.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
