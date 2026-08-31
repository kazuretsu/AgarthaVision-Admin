"use client";

import { useMemo, useState } from "react";
import type { EggSpecies, EpgTrendPoint } from "@/domain";
import { CHART_INK, SPECIES_COLOR, SPECIES_ORDER } from "@/lib/palette";

/**
 * Validated EPG over time, one line per species.
 *
 * A line chart because the job is change-over-time with series identity. One
 * y-axis only: every series is the same measure in the same unit, so there is
 * nothing to justify a second scale.
 *
 * Days with no validated record are absent rather than plotted as zero — a gap
 * in surveillance is a different claim from a day on which no eggs were found.
 * That is why the x-axis is ordinal over the days that exist, not a continuous
 * date scale.
 *
 * The palette carries a contrast WARN on two slots, so identity is reinforced
 * three ways here: a legend, a direct label at each line's last point, and the
 * table view below. Color alone never carries the message.
 */

const VIEW_W = 760;
const VIEW_H = 260;
const PAD = { top: 16, right: 108, bottom: 28, left: 52 };

function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

export function EpgTrendChart({ points }: { points: EpgTrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const { maxEpg, plotW, plotH, xFor, yFor, activeSpecies } = useMemo(() => {
    const highest = Math.max(
      1,
      ...points.flatMap((point) => SPECIES_ORDER.map((s) => point.epgBySpecies[s] ?? 0)),
    );
    const max = niceCeiling(highest);
    const w = VIEW_W - PAD.left - PAD.right;
    const h = VIEW_H - PAD.top - PAD.bottom;

    // Ordinal x. A single point sits centred rather than dividing by zero.
    const x = (index: number) =>
      points.length <= 1 ? PAD.left + w / 2 : PAD.left + (index / (points.length - 1)) * w;
    const y = (value: number) => PAD.top + h - (value / max) * h;

    // Only draw a species that actually appears; an all-zero line is noise.
    const active = SPECIES_ORDER.filter((species) =>
      points.some((point) => (point.epgBySpecies[species] ?? 0) > 0),
    );

    return { maxEpg: max, plotW: w, plotH: h, xFor: x, yFor: y, activeSpecies: active };
  }, [points]);

  if (points.length === 0) {
    return (
      <p className="rounded-[12px] border border-stone-hair bg-surface p-6 text-[13px] text-stone-mid">
        No validated samples in this period, so there is no trend to plot.
      </p>
    );
  }

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(maxEpg * fraction));
  const active = hover !== null ? points[hover] : null;

  return (
    <figure className="m-0 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {activeSpecies.map((species) => (
          <span key={species} className="flex items-center gap-1.5 text-[12px] text-stone-deep">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: SPECIES_COLOR[species] }}
            />
            {species}
          </span>
        ))}
        <button
          type="button"
          onClick={() => setShowTable((shown) => !shown)}
          className="ml-auto text-[12px] font-medium text-stone-mid underline-offset-4 hover:text-maroon hover:underline"
        >
          {showTable ? "Hide table" : "View as table"}
        </button>
      </div>

      <div className="relative rounded-[12px] border border-stone-hair bg-surface p-2">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="w-full"
          role="img"
          aria-label={`Validated eggs per gram by species across ${points.length} day${points.length === 1 ? "" : "s"}.`}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={yFor(tick)}
                y2={yFor(tick)}
                stroke={tick === 0 ? CHART_INK.axis : CHART_INK.grid}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={yFor(tick) + 4}
                textAnchor="end"
                fontSize={11}
                fill={CHART_INK.muted}
              >
                {tick.toLocaleString()}
              </text>
            </g>
          ))}

          {active ? (
            <line
              x1={xFor(hover as number)}
              x2={xFor(hover as number)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke={CHART_INK.axis}
              strokeWidth={1}
            />
          ) : null}

          {activeSpecies.map((species) => {
            const path = points
              .map(
                (point, index) =>
                  `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point.epgBySpecies[species] ?? 0)}`,
              )
              .join(" ");
            const lastIndex = points.length - 1;
            return (
              <g key={species}>
                <path
                  d={path}
                  fill="none"
                  stroke={SPECIES_COLOR[species]}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {/* Direct label: identity without a legend lookup. */}
                <text
                  x={xFor(lastIndex) + 10}
                  y={yFor(points[lastIndex].epgBySpecies[species] ?? 0) + 4}
                  fontSize={11}
                  fill={CHART_INK.muted}
                >
                  {species.split(" ")[0]}
                </text>
                {active ? (
                  <circle
                    cx={xFor(hover as number)}
                    cy={yFor(active.epgBySpecies[species] ?? 0)}
                    r={4}
                    fill={SPECIES_COLOR[species]}
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                ) : null}
              </g>
            );
          })}

          {points.map((point, index) => (
            <text
              key={point.date}
              x={xFor(index)}
              y={VIEW_H - 8}
              textAnchor="middle"
              fontSize={11}
              fill={CHART_INK.muted}
            >
              {/* Thin out labels so they cannot collide on a long period. */}
              {points.length <= 8 || index % Math.ceil(points.length / 8) === 0
                ? point.date.slice(5)
                : ""}
            </text>
          ))}

          {/* Hit targets wider than the marks. */}
          {points.map((point, index) => (
            <rect
              key={`hit-${point.date}`}
              x={xFor(index) - plotW / Math.max(points.length, 1) / 2}
              y={PAD.top}
              width={Math.max(plotW / Math.max(points.length, 1), 12)}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(index)}
            />
          ))}
        </svg>

        {active ? (
          <div className="pointer-events-none absolute right-3 top-3 rounded-[10px] border border-stone-hair bg-surface px-3 py-2 shadow-sm">
            <p className="tnum text-[12px] font-semibold text-stone-ink">{active.date}</p>
            {activeSpecies.map((species) => (
              <p key={species} className="flex items-center gap-1.5 text-[12px] text-stone-deep">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: SPECIES_COLOR[species] }}
                />
                {species.split(" ")[0]}
                <span className="tnum ml-auto pl-3 font-medium">
                  {(active.epgBySpecies[species] ?? 0).toLocaleString()}
                </span>
              </p>
            ))}
          </div>
        ) : null}
      </div>

      {showTable ? <TrendTable points={points} species={activeSpecies} /> : null}

      <figcaption className="text-[12px] text-stone-mid">
        Validated eggs per gram per day. Days with no validated sample are omitted rather than shown
        as zero.
      </figcaption>
    </figure>
  );
}

function TrendTable({
  points,
  species,
}: {
  points: EpgTrendPoint[];
  species: readonly EggSpecies[];
}) {
  return (
    <div className="overflow-x-auto rounded-[12px] border border-stone-hair">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-background text-left">
            <th className="px-3 py-2 font-semibold text-stone-deep">Date</th>
            {species.map((name) => (
              <th key={name} className="px-3 py-2 text-right font-semibold text-stone-deep">
                {name}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-semibold text-stone-deep">Total</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.date} className="border-t border-stone-hair">
              <td className="tnum px-3 py-2 text-stone-ink">{point.date}</td>
              {species.map((name) => (
                <td key={name} className="tnum px-3 py-2 text-right text-stone-deep">
                  {(point.epgBySpecies[name] ?? 0).toLocaleString()}
                </td>
              ))}
              <td className="tnum px-3 py-2 text-right font-semibold text-stone-ink">
                {point.totalEpg.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
