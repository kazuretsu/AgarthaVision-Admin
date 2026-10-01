import type { SessionSummary } from "@/domain";
import { canonicalSpecies, formatLpfRange, speciesRows } from "@/domain";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SpeciesName } from "./SpeciesName";

/**
 * A session's findings, laid out like the app's Session Detail: per species, the
 * LPF range across the fields examined, the descriptor read off the worst field,
 * and the eggs counted. A range, never a mean; no EPG and no WHO tier.
 */
export function LpfTable({ summary }: { summary: SessionSummary }) {
  const rows = speciesRows(summary);

  if (rows.length === 0) {
    return (
      <p className="rounded-[12px] border border-stone-hair bg-surface p-4 text-[13px] text-stone-deep">
        No parasites found in the {summary.fieldCount} field{summary.fieldCount === 1 ? "" : "s"}{" "}
        examined.
      </p>
    );
  }

  return (
    <Table>
      <TableCaption>
        Findings per species across {summary.fieldCount} field
        {summary.fieldCount === 1 ? "" : "s"}
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Species</TableHead>
          <TableHead>LPF range</TableHead>
          <TableHead>Descriptor</TableHead>
          <TableHead className="text-right">Eggs counted</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.species}>
            <TableCell className="font-medium text-stone-ink">
              <SpeciesName species={row.species} />
            </TableCell>
            <TableCell className="tnum">{row.lpf ? formatLpfRange(row.lpf) : "—"}</TableCell>
            <TableCell>
              {row.lpf?.descriptor ? <Badge variant="neutral">{row.lpf.descriptor}</Badge> : "—"}
            </TableCell>
            <TableCell className="tnum text-right">{row.eggs}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** One line per species, for a session row: `Ascaris lumbricoides 0–4 LPF · few`. */
export function LpfInline({ summary }: { summary: SessionSummary }) {
  const entries = Object.entries(summary.lpf).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    return <span className="text-stone-mid">No parasites found</span>;
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {entries.map(([species, density]) => (
        <li key={species}>
          <SpeciesName species={canonicalSpecies(species)} />{" "}
          <span className="tnum text-stone-mid">
            {formatLpfRange(density)}
            {density.descriptor ? ` · ${density.descriptor}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
