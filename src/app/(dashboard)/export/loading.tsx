import { Card } from "@/components/ui/card";
import {
  ExportBodySkeleton,
  FiltersSkeleton,
  HeaderSkeleton,
} from "@/components/loading/PageSkeletons";

/**
 * The research export's shape while it counts: title, the period card with its
 * form, the count and the download buttons. The page never answers 404.
 */
export default function ExportLoading() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
      <HeaderSkeleton />
      <Card className="gap-5 p-5">
        <FiltersSkeleton fields={2} />
        <ExportBodySkeleton />
      </Card>
    </main>
  );
}
