import { getDatabase } from "@/adapters/registry";
import {
  TRAINING_BOX_DROP_LABELS,
  TRAINING_FRAME_EXCLUSION_LABELS,
  TRAINING_SNAPSHOT_LIMIT,
  TRAINING_SPLITS,
  buildTrainingSet,
  type OrganizationSummary,
  type TrainingFilter,
} from "@/domain";
import { MigrationNotAppliedError } from "@/ports";
import { MissingEnvironmentError } from "@/lib/env";
import { StatCard } from "@/components/dashboard/StatCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateSnapshotForm } from "./CreateSnapshotForm";

const SPLIT_LABELS = { train: "Train", val: "Validation", test: "Test" } as const;
const count = (value: number) => value.toLocaleString();

/**
 * What a snapshot of this filter would hold, counted by the label rules before anything
 * is written, and the form that freezes it. Reads inside a Suspense boundary keyed by
 * the filter, so a new filter shows this card's skeleton.
 */
export async function TrainingPreview({
  filter,
  query,
  organizations,
}: {
  filter: TrainingFilter;
  query: string;
  organizations: OrganizationSummary[];
}) {
  let frames;
  try {
    frames = await (
      await getDatabase()
    ).trainingFrames({
      startedFrom: filter.from,
      startedTo: filter.to,
      organizationIds: filter.organizationIds,
      modelVersions: filter.modelVersions,
    });
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

  const { summary } = buildTrainingSet(frames, filter);
  const names = new Map(organizations.map((organization) => [organization.id, organization.name]));
  const tooLarge = summary.frames > TRAINING_SNAPSHOT_LIMIT;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-5 gap-3">
        <StatCard label="Frames" value={count(summary.frames)} />
        <StatCard label="Boxes" value={count(summary.boxes)} note="Labelled eggs" />
        <StatCard label="Background" value={count(summary.background)} note="Frames with no egg" />
        <StatCard
          label="Hard negatives"
          value={count(summary.hardNegatives)}
          note={filter.includeHardNegatives ? "In the manifest" : "Switched off"}
        />
        <StatCard label="Patients" value={count(summary.patients)} note="Each in one split" />
      </div>

      {(summary.incomplete ?? 0) > 0 ? (
        <p role="status" className="rounded-[10px] bg-warn-tint px-4 py-2 text-[13px] text-warn">
          {count(summary.incomplete ?? 0)} frame{summary.incomplete === 1 ? "" : "s"} with{" "}
          {count(summary.unboxedEggs ?? 0)} egg{summary.unboxedEggs === 1 ? "" : "s"} counted but
          never boxed {summary.incomplete === 1 ? "is" : "are"} in, marked incomplete. Their label
          files hold only the boxed eggs, so a training run reads the others as background.
        </p>
      ) : null}

      {tooLarge ? (
        <p role="status" className="rounded-[10px] bg-warn-tint px-4 py-2 text-[13px] text-warn">
          A snapshot holds at most {count(TRAINING_SNAPSHOT_LIMIT)} frames. Narrow the filters to
          create one.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-6">
        <Table>
          <TableCaption>By split. A patient&apos;s frames are all in one.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Split</TableHead>
              <TableHead className="text-right">Frames</TableHead>
              <TableHead className="text-right">Background</TableHead>
              {filter.includeUnboxed ? (
                <TableHead className="text-right">Incomplete</TableHead>
              ) : null}
              <TableHead className="text-right">Boxes</TableHead>
              <TableHead className="text-right">Patients</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {TRAINING_SPLITS.map((split) => {
              const row = summary.splits[split];
              return (
                <TableRow key={split}>
                  <TableCell>{SPLIT_LABELS[split]}</TableCell>
                  <TableCell className="tnum text-right">{count(row.frames)}</TableCell>
                  <TableCell className="tnum text-right">{count(row.background)}</TableCell>
                  {filter.includeUnboxed ? (
                    <TableCell className="tnum text-right">{count(row.incomplete ?? 0)}</TableCell>
                  ) : null}
                  <TableCell className="tnum text-right">{count(row.boxes)}</TableCell>
                  <TableCell className="tnum text-right">{count(row.patients)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <Table>
          <TableCaption>Boxes by class and split, in the class index order.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Class</TableHead>
              {TRAINING_SPLITS.map((split) => (
                <TableHead key={split} className="text-right">
                  {SPLIT_LABELS[split]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.classes.map((row) => (
              <TableRow key={row.class}>
                <TableCell className={row.class === "Hookworm" ? undefined : "italic"}>
                  {row.class}
                </TableCell>
                {TRAINING_SPLITS.map((split) => (
                  <TableCell key={split} className="tnum text-right">
                    {count(row.boxes[split])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Table>
          <TableCaption>By the model version that read each frame.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Model version</TableHead>
              <TableHead className="text-right">Frames</TableHead>
              <TableHead className="text-right">Boxes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.modelVersions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-stone-mid">
                  No frame.
                </TableCell>
              </TableRow>
            ) : (
              summary.modelVersions.map((row) => (
                <TableRow key={row.modelVersion}>
                  <TableCell className="font-mono text-[12px] break-all">
                    {row.modelVersion}
                  </TableCell>
                  <TableCell className="tnum text-right">{count(row.frames)}</TableCell>
                  <TableCell className="tnum text-right">{count(row.boxes)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <Table>
          <TableCaption>By laboratory. The file names each by its code only.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Laboratory</TableHead>
              <TableHead>Code in the file</TableHead>
              <TableHead className="text-right">Frames</TableHead>
              <TableHead className="text-right">Boxes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.labs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-stone-mid">
                  No frame.
                </TableCell>
              </TableRow>
            ) : (
              summary.labs.map((row) => (
                <TableRow key={row.labCode}>
                  <TableCell>
                    {row.organizationId
                      ? (names.get(row.organizationId) ?? "Unknown laboratory")
                      : "No laboratory"}
                  </TableCell>
                  <TableCell className="font-mono text-[12px]">{row.labCode}</TableCell>
                  <TableCell className="tnum text-right">{count(row.frames)}</TableCell>
                  <TableCell className="tnum text-right">{count(row.boxes)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Table>
        <TableCaption>
          Left out, and why. A frame goes in whole or not at all, so no egg is taught as background.
          {summary.unrecognisedClasses.length > 0
            ? ` Species not trained on: ${summary.unrecognisedClasses.join(", ")}.`
            : ""}
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Reason</TableHead>
            <TableHead className="text-right">Count</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {summary.excludedFrames.length === 0 && summary.droppedBoxes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={2} className="text-stone-mid">
                Nothing.
              </TableCell>
            </TableRow>
          ) : (
            <>
              {summary.excludedFrames.map((row) => (
                <TableRow key={row.reason}>
                  <TableCell>Frames: {TRAINING_FRAME_EXCLUSION_LABELS[row.reason]}</TableCell>
                  <TableCell className="tnum text-right">{count(row.frames)}</TableCell>
                </TableRow>
              ))}
              {summary.droppedBoxes.map((row) => (
                <TableRow key={row.reason}>
                  <TableCell>Boxes: {TRAINING_BOX_DROP_LABELS[row.reason]}</TableCell>
                  <TableCell className="tnum text-right">{count(row.boxes)}</TableCell>
                </TableRow>
              ))}
            </>
          )}
        </TableBody>
      </Table>

      <Card>
        <CardHeader>
          <CardTitle>Create a snapshot</CardTitle>
          <CardDescription>
            Freezes these frames and their labels as they are now. A medtech changing a ruling later
            changes nothing in it. Recorded in the audit trail.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateSnapshotForm query={query} disabled={summary.frames === 0 || tooLarge} />
        </CardContent>
      </Card>
    </div>
  );
}
