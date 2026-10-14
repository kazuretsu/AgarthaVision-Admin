import Link from "next/link";
import { formatRate, MIN_REPORTABLE_SMEARS, type AreaFigure, type AreaRow } from "@/domain";
import { LinkPending } from "@/components/loading/LinkPending";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function Figures({ figure }: { figure: AreaFigure }) {
  if (figure.kind === "too_few") {
    return (
      <TableCell colSpan={3} className="text-stone-mid">
        Too few to report
      </TableCell>
    );
  }
  if (figure.kind === "none") {
    return (
      <TableCell colSpan={3} className="text-stone-mid">
        No smears examined
      </TableCell>
    );
  }
  return (
    <>
      <TableCell className="text-right tabular-nums">{figure.examined.toLocaleString()}</TableCell>
      <TableCell className="text-right tabular-nums">{figure.positive.toLocaleString()}</TableCell>
      <TableCell className="text-right tabular-nums">{formatRate(figure.rate)}</TableCell>
    </>
  );
}

/**
 * Every area on the map, with the same figures in words: the map's equal for a keyboard, a
 * screen reader or a printout. An area with an area below it links there.
 */
export function AreaTable({
  kind,
  areas,
  hrefOf,
}: {
  kind: string;
  areas: AreaRow[];
  hrefOf: (code: string) => string | null;
}) {
  return (
    <Table>
      <TableCaption>
        An area with fewer than {MIN_REPORTABLE_SMEARS} smears examined shows no figures.
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>{kind}</TableHead>
          <TableHead className="text-right">Examined</TableHead>
          <TableHead className="text-right">Positive</TableHead>
          <TableHead className="text-right">Rate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {areas.map((area) => {
          const href = hrefOf(area.code);
          return (
            <TableRow key={area.code} data-area={area.code}>
              <TableCell className="max-w-56 truncate font-medium text-stone-ink">
                {href ? (
                  <Link href={href} className="hover:text-maroon hover:underline">
                    {area.name}
                    <LinkPending />
                  </Link>
                ) : (
                  area.name
                )}
              </TableCell>
              <Figures figure={area.figure} />
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
