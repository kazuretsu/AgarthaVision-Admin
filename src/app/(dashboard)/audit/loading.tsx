import {
  Busy,
  FiltersSkeleton,
  HeaderSkeleton,
  TableSkeleton,
} from "@/components/loading/PageSkeletons";

/**
 * The audit trail's shape while it reads: title, filters and the entries table. The
 * page never answers 404, so a route-level loading state cannot hide one.
 */
export default function AuditLoading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <HeaderSkeleton />
      <FiltersSkeleton fields={4} />
      <Busy label="Loading audit entries…">
        <TableSkeleton rows={10} columns={4} />
      </Busy>
    </main>
  );
}
