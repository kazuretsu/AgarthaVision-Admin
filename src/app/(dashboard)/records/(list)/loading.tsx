import {
  Busy,
  FiltersSkeleton,
  HeaderSkeleton,
  TableSkeleton,
} from "@/components/loading/PageSkeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown while the patient list reads, in its shape: title, the search form, the
 * count and the patients table. Without it the previous page stays on screen with
 * no sign the click registered.
 *
 * It covers the list only, through the `(list)` route group. A route-level
 * loading state starts streaming the response with a 200 before the page runs, so
 * a record page under it could never answer a missing id with a real 404. Record
 * pages decide 404 first and show their own progress below that check, around
 * the frames (`FramesFallback`).
 */
export default function RecordsLoading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <HeaderSkeleton />
      <FiltersSkeleton fields={2} />
      <Busy label="Loading records…" className="flex flex-col gap-6">
        <Skeleton className="h-4 w-56" />
        <TableSkeleton rows={8} columns={5} />
      </Busy>
    </main>
  );
}
