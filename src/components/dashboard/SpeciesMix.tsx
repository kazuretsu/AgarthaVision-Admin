import type { SpeciesMixRow } from "@/domain";
import { speciesColor } from "@/lib/palette";
import { SpeciesName } from "@/components/records/SpeciesName";

/**
 * Which species the positive smears carried. Horizontal bars on a common
 * baseline, because the job is comparing magnitudes; every row states its count
 * and share as text, so the bar is an aid, not the only carrier of the value.
 */
export function SpeciesMix({ rows }: { rows: SpeciesMixRow[] }) {
  if (rows.length === 0) {
    return <p className="text-[13px] text-stone-mid">No positive smears in this period.</p>;
  }

  return (
    <ul className="flex list-none flex-col gap-3 p-0">
      {rows.map((row) => (
        <li key={row.species} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="text-stone-deep">
              <SpeciesName species={row.species} />
            </span>
            <span className="tnum text-stone-ink">
              {row.positiveSmears.toLocaleString()} smear{row.positiveSmears === 1 ? "" : "s"}
              <span className="ml-2 text-stone-mid">{Math.round(row.share * 100)}%</span>
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full"
              style={{ width: `${row.share * 100}%`, background: speciesColor(row.species) }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
