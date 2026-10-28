import { Busy, CardSkeleton, HeaderSkeleton } from "@/components/loading/PageSkeletons";

/**
 * Settings' shape while it reads: title and the two-step sign-in card. The page never answers
 * 404, so a route-level loading state cannot hide one.
 */
export default function SettingsLoading() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <HeaderSkeleton />
      <Busy label="Loading settings…">
        <CardSkeleton bodyClassName="h-24" />
      </Busy>
    </main>
  );
}
