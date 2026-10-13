import { Download } from "lucide-react";
import { getDatabase } from "@/adapters/registry";
import { TRAINING_SPLITS } from "@/domain";
import { MigrationNotAppliedError } from "@/ports";
import { MissingEnvironmentError } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Every snapshot, newest first, each with its download. */
export async function SnapshotsTable() {
  let snapshots;
  try {
    snapshots = await (await getDatabase()).listTrainingSnapshots();
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError || cause instanceof MigrationNotAppliedError) {
      return (
        <p className="text-[13px] text-stone-deep">
          {cause instanceof MissingEnvironmentError
            ? `${cause.variable} is not set, so nothing could be read.`
            : cause.message}
        </p>
      );
    }
    throw cause;
  }

  if (snapshots.length === 0) {
    return (
      <p className="rounded-[12px] border border-stone-hair bg-surface p-6 text-[13px] text-stone-mid">
        No snapshot yet. Preview a filter above and create one.
      </p>
    );
  }

  return (
    <Table className="min-w-[760px]">
      <TableCaption>
        Each download is a zip of images, YOLO labels, data.yaml, COCO annotations, a manifest and a
        data card, recorded in the audit trail before it starts.
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Snapshot</TableHead>
          <TableHead>Created by</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="text-right">Frames</TableHead>
          <TableHead className="text-right">Boxes</TableHead>
          <TableHead className="text-right">Train / val / test</TableHead>
          <TableHead>
            <span className="sr-only">Download</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {snapshots.map((snapshot) => (
          <TableRow key={snapshot.id}>
            <TableCell className="font-medium text-stone-ink">{snapshot.name}</TableCell>
            <TableCell>{snapshot.createdByLabel ?? "Unnamed user"}</TableCell>
            <TableCell className="whitespace-nowrap">
              {formatDateTime(snapshot.createdAt)}
            </TableCell>
            <TableCell className="tnum text-right">
              {snapshot.frameCount.toLocaleString()}
            </TableCell>
            <TableCell className="tnum text-right">{snapshot.boxCount.toLocaleString()}</TableCell>
            <TableCell className="tnum text-right whitespace-nowrap">
              {snapshot.summary
                ? TRAINING_SPLITS.map((split) =>
                    (snapshot.summary?.splits[split]?.frames ?? 0).toLocaleString(),
                  ).join(" / ")
                : "—"}
            </TableCell>
            <TableCell className="text-right">
              <a
                href={`/training-data/snapshots/${snapshot.id}/download`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Download aria-hidden /> Zip
              </a>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
