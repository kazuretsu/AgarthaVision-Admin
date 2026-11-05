import { Suspense } from "react";
import { getDatabase } from "@/adapters/registry";
import type { OrganizationSummary } from "@/domain";
import { MigrationNotAppliedError } from "@/ports";
import { requirePageAccess } from "@/lib/console-access";
import { MissingEnvironmentError } from "@/lib/env";
import { parseTrainingFilter, trainingFilterQuery } from "@/lib/training-filter";
import {
  Busy,
  CardSkeleton,
  StatCardsSkeleton,
  TableSkeleton,
} from "@/components/loading/PageSkeletons";
import { DataUnavailable } from "@/components/records/DataUnavailable";
import { SnapshotsTable } from "@/components/training/SnapshotsTable";
import { TrainingFilterForm } from "@/components/training/TrainingFilterForm";
import { TrainingPreview } from "@/components/training/TrainingPreview";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Model training data (14zcqntm62u). Super admins only; everyone else gets a 404, so,
 * like `/organizations`, no route-level `loading.tsx`, which would answer 200 first.
 *
 * Filter → preview (counted by the label rules, nothing written) → create a frozen
 * snapshot → download it as a zip. The filter lives in the URL, and the snapshot is
 * built from the same query the preview showed.
 */
export const dynamic = "force-dynamic";

export default async function TrainingDataPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // A literal list, as every narrow page writes it (src/app/not-found-status.test.ts reads it).
  await requirePageAccess(["super_admin"]);

  const asked = parseTrainingFilter(await searchParams);

  let organizations: OrganizationSummary[];
  let modelVersions: { modelVersion: string; frames: number }[];
  let unboxedAvailable: boolean;
  try {
    const db = await getDatabase();
    [organizations, modelVersions, unboxedAvailable] = await Promise.all([
      db.listOrganizations(),
      db.trainingModelVersions(),
      db.trainingSupportsUnboxed(),
    ]);
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return <DataUnavailable title="Training data" variable={cause.variable} />;
    }
    if (cause instanceof MigrationNotAppliedError) {
      return (
        <main className="mx-auto w-full max-w-6xl px-6 py-10">
          <h1 className="text-[22px] font-bold text-stone-ink">Training data</h1>
          <p className="mt-3 text-[14px] text-stone-deep">{cause.message}</p>
        </main>
      );
    }
    throw cause;
  }

  // Before admin/0013 the option is not offered, so the preview and the snapshot match.
  const filter = { ...asked, includeUnboxed: asked.includeUnboxed && unboxedAvailable };
  const query = trainingFilterQuery(filter).toString();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-[22px] font-bold text-stone-ink">Training data</h1>
        <p className="max-w-3xl text-[13px] text-stone-mid">
          Verified frames with every box a medtech confirmed, corrected, redrew or added, as a
          frozen snapshot a YOLO or COCO training run reads directly. Split by patient. Frames are
          named by sample ID; no patient, medtech or barangay is in the file, and laboratories are
          opaque codes. Each snapshot and each download is recorded in the audit trail.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Frames</CardTitle>
          <CardDescription>
            By the day each session started, Philippine time. A deleted duplicate is never used.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TrainingFilterForm
            filter={filter}
            organizations={organizations}
            modelVersions={modelVersions}
            unboxedAvailable={unboxedAvailable}
          />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-[16px] font-semibold text-stone-ink">Preview</h2>
        <Suspense
          key={query}
          fallback={
            <Busy label="Counting frames" className="flex flex-col gap-6">
              <StatCardsSkeleton count={5} />
              <CardSkeleton bodyClassName="h-40" />
            </Busy>
          }
        >
          <TrainingPreview filter={filter} query={query} organizations={organizations} />
        </Suspense>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[16px] font-semibold text-stone-ink">Snapshots</h2>
        <Suspense
          fallback={
            <Busy label="Loading snapshots">
              <TableSkeleton rows={3} columns={7} />
            </Busy>
          }
        >
          <SnapshotsTable />
        </Suspense>
      </section>
    </main>
  );
}
