import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading states shaped like the pages they stand in for (14zcqntk6h5), composed from
 * shadcn's `Skeleton` and `Card`. A reader always sees that something is loading, in
 * the shape of what is coming, so a click never reads as broken.
 *
 * Route-level `loading.tsx` files render a whole page of these; pages render the
 * body pieces as Suspense fallbacks keyed by their query, so a new filter or page
 * shows them too (a `loading.tsx` does not show for a query-string change).
 */

/** Marks a region as loading for assistive technology, with what is loading. */
export function Busy({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** A page's title and the line under it. */
export function HeaderSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-full max-w-xl" />
    </div>
  );
}

/** A row of filter fields with their labels, and the submit button. */
export function FiltersSkeleton({ fields = 3 }: { fields?: number }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="flex flex-col gap-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-40" />
        </div>
      ))}
      <Skeleton className="h-9 w-20" />
    </div>
  );
}

/** A console table: its header band and rows, in the table's own frame. */
export function TableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-[12px] border border-stone-hair bg-surface">
      <div className="flex gap-6 bg-surface-sunken px-3 py-3">
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={index} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex gap-6 border-t border-stone-hair px-3 py-3.5">
          {Array.from({ length: columns }, (_, index) => (
            <Skeleton key={index} className={index === 0 ? "h-4 flex-[1.5]" : "h-4 flex-1"} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A grid of headline-number cards (`StatCard`). */
export function StatCardsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }, (_, index) => (
        <Card key={index} className="gap-2 p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-20" />
        </Card>
      ))}
    </div>
  );
}

/** A card with a title, a description and a body of the given height. */
export function CardSkeleton({ bodyClassName = "h-48" }: { bodyClassName?: string }) {
  return (
    <Card className="gap-3 p-5">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-64" />
      <Skeleton className={`mt-2 w-full ${bodyClassName}`} />
    </Card>
  );
}

/** The dashboard below its header: five figures, the weekly trend and the species mix. */
export function DashboardBodySkeleton() {
  return (
    <Busy label="Loading the dashboard…" className="flex flex-col gap-6">
      <StatCardsSkeleton count={5} />
      <div className="grid grid-cols-[2fr_1fr] gap-6">
        <CardSkeleton bodyClassName="h-56" />
        <CardSkeleton bodyClassName="h-56" />
      </div>
    </Busy>
  );
}

/** The export card's count line and download buttons. */
export function ExportBodySkeleton() {
  return (
    <Busy label="Counting smears…" className="flex flex-wrap items-center gap-3">
      <Skeleton className="h-5 w-72" />
      <div className="ml-auto flex gap-2">
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-20" />
      </div>
    </Busy>
  );
}
