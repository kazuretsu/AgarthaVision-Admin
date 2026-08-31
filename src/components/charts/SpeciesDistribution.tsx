import type { SpeciesDistributionSlice } from "@/domain";
import { SPECIES_COLOR } from "@/lib/palette";

/**
 * Confirmed eggs per species.
 *
 * Horizontal bars, not a pie: the job is comparing magnitudes, and length on a
 * common baseline is read more accurately than angle. Every row carries its
 * count and share as text, so the bar is a visual aid rather than the only
 * carrier of the value.
 */
export function SpeciesDistribution({ slices }: { slices: SpeciesDistributionSlice[] }) {
  if (slices.length === 0) {
    return (
      <p className="text-[13px] text-stone-mid">
        No confirmed eggs in this period, so there is no distribution to show.
      </p>
    );
  }

  const largest = Math.max(...slices.map((slice) => slice.eggCount));

  return (
    <ul className="flex list-none flex-col gap-3 p-0">
      {slices.map((slice) => (
        <li key={slice.species} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="text-stone-deep">{slice.species}</span>
            <span className="tnum text-stone-ink">
              {slice.eggCount.toLocaleString()}
              <span className="ml-2 text-stone-mid">{Math.round(slice.share * 100)}%</span>
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full"
              style={{
                width: `${largest === 0 ? 0 : (slice.eggCount / largest) * 100}%`,
                background: SPECIES_COLOR[slice.species],
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
