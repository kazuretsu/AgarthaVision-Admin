import {
  DashboardBodySkeleton,
  FiltersSkeleton,
  HeaderSkeleton,
} from "@/components/loading/PageSkeletons";

/**
 * The dashboard's shape while it reads: on a click the skeleton shows at once
 * instead of the previous page staying put. The dashboard never answers 404, so a
 * route-level loading state cannot hide one (`src/app/not-found-status.test.ts`).
 */
export default function DashboardLoading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <HeaderSkeleton />
        <FiltersSkeleton fields={2} />
      </div>
      <DashboardBodySkeleton />
    </main>
  );
}
