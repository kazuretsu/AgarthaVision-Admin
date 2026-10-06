import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Busy,
  FiltersSkeleton,
  HeaderSkeleton,
  TableSkeleton,
} from "@/components/loading/PageSkeletons";

/**
 * The People page's shape while it reads: title, the invite card, the search and
 * role filter, and the people table. In the `(list)` route group, so it never
 * covers `/people/[userId]`, which can answer 404.
 */
export default function PeopleLoading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <HeaderSkeleton />
      <Card className="flex-row items-end gap-3 p-5">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-32" />
      </Card>
      <FiltersSkeleton fields={2} />
      <Busy label="Loading people…">
        <TableSkeleton rows={6} columns={6} />
      </Busy>
    </main>
  );
}
