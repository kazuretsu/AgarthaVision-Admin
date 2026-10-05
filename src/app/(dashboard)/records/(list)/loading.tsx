import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown while the patient list reads; without it the previous page stays on
 * screen with no sign the click registered.
 *
 * It covers the list only, through the `(list)` route group. A route-level
 * loading state starts streaming the response with a 200 before the page runs, so
 * a record page under it could never answer a missing id with a real 404. Record
 * pages decide 404 first and show their own progress below that check, around
 * the frames (`FramesFallback`).
 */
export default function RecordsLoading() {
  return (
    <main
      className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-10"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading records…</span>
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-80" />
      <Skeleton className="mt-4 h-64 w-full rounded-[12px]" />
    </main>
  );
}
