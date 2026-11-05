import { BOUNDARY_ATTRIBUTION, MIN_REPORTABLE_SMEARS, PREVALENCE_BANDS } from "@/domain";
import { MAP_PALETTE } from "@/lib/map/palette";

function Swatch({ light, dark, hatched }: { light: string; dark: string; hatched?: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block size-3.5 shrink-0 rounded-[3px] border border-stone-line bg-(--swatch) dark:bg-(--swatch-dark)"
      style={
        {
          "--swatch": light,
          "--swatch-dark": dark,
          backgroundImage: hatched
            ? "repeating-linear-gradient(135deg, var(--color-stone-mid) 0 1.5px, transparent 1.5px 4px)"
            : undefined,
        } as React.CSSProperties
      }
    />
  );
}

/** The map's key, and the boundary attribution the licence asks for wherever they are shown. */
export function MapLegend() {
  const { light, dark } = MAP_PALETTE;
  return (
    <div className="flex flex-col gap-2 text-[12px] text-stone-deep">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="font-medium text-stone-ink">Smears positive</span>
        {PREVALENCE_BANDS.map(({ band, label }) => (
          <span key={band} className="flex items-center gap-1.5">
            <Swatch light={light.bands[band]} dark={dark.bands[band]} /> {label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <Swatch light={light.tooFew} dark={dark.tooFew} hatched /> Too few to report (under{" "}
          {MIN_REPORTABLE_SMEARS} smears)
        </span>
        <span className="flex items-center gap-1.5">
          <Swatch light={light.none} dark={dark.none} /> No smears examined
        </span>
      </div>
      <p className="text-[11px] text-stone-mid" data-testid="boundary-attribution">
        {BOUNDARY_ATTRIBUTION}
      </p>
    </div>
  );
}
