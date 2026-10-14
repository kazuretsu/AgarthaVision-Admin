import Link from "next/link";
import { formatRate, MIN_REPORTABLE_SMEARS, type AreaFigure, type AreaRow } from "@/domain";
import { cn } from "@/lib/utils";
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

/** Isolating one area on the map: the link that draws it alone, and the one that clears it. */
export interface IsolateLinks {
  hrefOf: (code: string) => string;
  current: string | null;
  clearHref: string;
}

/**
 * Every area on the map, with the same figures in words: the map's equal for a keyboard, a
 * screen reader or a printout. An area with an area below it links there. With `isolate`, each
 * row can draw its area alone on the map (14zcqntjnt6).
 */
export function AreaTable({
  kind,
  areas,
  hrefOf,
  isolate,
  caption = `An area with fewer than ${MIN_REPORTABLE_SMEARS} smears examined shows no figures.`,
}: {
  kind: string;
  areas: AreaRow[];
  hrefOf: (code: string) => string | null;
  isolate?: IsolateLinks;
  caption?: string;
}) {
  return (
    <Table>
      <TableCaption>{caption}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>{kind}</TableHead>
          <TableHead className="text-right">Examined</TableHead>
          <TableHead className="text-right">Positive</TableHead>
          <TableHead className="text-right">Rate</TableHead>
          {isolate ? (
            <TableHead>
              <span className="sr-only">On the map</span>
            </TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {areas.map((area) => {
          const href = hrefOf(area.code);
          const isolated = isolate?.current === area.code;
          return (
            <TableRow
              key={area.code}
              data-area={area.code}
              data-isolated={isolated || undefined}
              className={isolated ? "bg-surface-sunken" : undefined}
            >
              <TableCell
                className={cn(
                  "truncate font-medium text-stone-ink",
                  isolate ? "max-w-40" : "max-w-56",
                )}
              >
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
              {isolate ? (
                <TableCell className="text-right whitespace-nowrap">
                  <Link
                    href={isolated ? isolate.clearHref : isolate.hrefOf(area.code)}
                    aria-label={
                      isolated ? "Show every area on the map" : `Show only ${area.name} on the map`
                    }
                    className="text-[12px] text-stone-mid hover:text-maroon hover:underline"
                  >
                    {isolated ? "Show all" : "Isolate"}
                  </Link>
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
