import type { TrendPoint } from "@/domain";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Smears examined per week, with the positive share of each bar filled in and the
 * positive rate written above it. Inline SVG, no charting library. The table
 * under it carries every value, so nothing depends on reading the bars.
 *
 * Weeks with nothing examined are absent rather than drawn as zero; a gap in
 * surveillance is not a week of negative smears.
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  if (points.length === 0) {
    return <p className="text-[13px] text-stone-mid">No smears examined in this period.</p>;
  }

  const width = 720;
  const height = 220;
  const pad = { top: 24, right: 8, bottom: 28, left: 36 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = Math.max(...points.map((point) => point.examined));
  const slot = plotW / points.length;
  const barW = Math.min(48, slot * 0.7);
  const y = (value: number) => pad.top + plotH - (value / max) * plotH;
  const ticks = [0, Math.round(max / 2), max].filter(
    (tick, index, all) => all.indexOf(tick) === index,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-4 text-[12px] text-stone-deep">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-stone-line" aria-hidden /> Examined
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-maroon" aria-hidden /> Positive
        </span>
        <span className="text-stone-mid">Percent above each bar: positive rate</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full rounded-[12px] border border-stone-hair bg-surface"
        role="img"
        aria-label="Smears examined and positive per week"
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--hair)"
            />
            <text
              x={pad.left - 6}
              y={y(tick) + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--mid)"
              className="tnum"
            >
              {tick}
            </text>
          </g>
        ))}
        {points.map((point, index) => {
          const x = pad.left + slot * index + (slot - barW) / 2;
          return (
            <g key={point.weekStart}>
              <rect
                x={x}
                y={y(point.examined)}
                width={barW}
                height={plotH + pad.top - y(point.examined)}
                rx="3"
                fill="var(--line)"
              />
              <rect
                x={x}
                y={y(point.positive)}
                width={barW}
                height={plotH + pad.top - y(point.positive)}
                rx="3"
                fill="var(--primary)"
              />
              <text
                x={x + barW / 2}
                y={y(point.examined) - 6}
                textAnchor="middle"
                fontSize="11"
                fill="var(--deep)"
                className="tnum"
              >
                {point.rate === null ? "" : `${Math.round(point.rate * 100)}%`}
              </text>
              <text
                x={x + barW / 2}
                y={height - 10}
                textAnchor="middle"
                fontSize="10"
                fill="var(--mid)"
                className="tnum"
              >
                {point.weekStart.slice(5)}
              </text>
            </g>
          );
        })}
      </svg>
      <details className="text-[13px]">
        <summary className="cursor-pointer text-stone-mid hover:text-maroon">View as table</summary>
        <div className="mt-2">
          <Table>
            <TableCaption>Smears examined and positive per week</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Week of</TableHead>
                <TableHead className="text-right">Examined</TableHead>
                <TableHead className="text-right">Positive</TableHead>
                <TableHead className="text-right">Positive rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {points.map((point) => (
                <TableRow key={point.weekStart}>
                  <TableCell className="tnum">{point.weekStart}</TableCell>
                  <TableCell className="tnum text-right">{point.examined}</TableCell>
                  <TableCell className="tnum text-right">{point.positive}</TableCell>
                  <TableCell className="tnum text-right">
                    {point.rate === null ? "—" : `${(point.rate * 100).toFixed(1)}%`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>
    </div>
  );
}
