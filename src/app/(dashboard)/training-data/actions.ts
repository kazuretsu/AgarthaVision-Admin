"use server";

import { revalidatePath } from "next/cache";
import { getAdminWrites, getDatabase } from "@/adapters/registry";
import {
  TRAINING_SNAPSHOT_LIMIT,
  buildTrainingSet,
  isAllowed,
  normaliseOrganizationName,
} from "@/domain";
import {
  AdminWriteError,
  MigrationNotAppliedError,
  NotAuthenticatedError,
  NotAuthorizedError,
} from "@/ports";
import { getConsoleActor } from "@/lib/console-access";
import { trainingFilterFromQuery } from "@/lib/training-filter";
import { TRAINING_ACCESS } from "./access";
import type { TrainingSnapshotFormState } from "./state";

const NOT_PERMITTED = "Only a super admin can create a training snapshot.";

/**
 * Freezes the previewed frames as a snapshot. The frames are read again here, from
 * the filter the preview showed, never taken from the browser; the database checks
 * the caller again, takes each image's path from the sample row, and writes the
 * audit entry with the snapshot.
 */
export async function createTrainingSnapshot(
  _previous: TrainingSnapshotFormState,
  formData: FormData,
): Promise<TrainingSnapshotFormState> {
  const typed = String(formData.get("name") ?? "");
  const refuse = (error: string): TrainingSnapshotFormState => ({ error, done: null, name: typed });

  try {
    if (!isAllowed((await getConsoleActor()).access, TRAINING_ACCESS)) return refuse(NOT_PERMITTED);
  } catch (cause) {
    if (cause instanceof NotAuthenticatedError || cause instanceof NotAuthorizedError) {
      return refuse(NOT_PERMITTED);
    }
    throw cause;
  }

  // A snapshot name follows the same rule as a laboratory's: trimmed, 2 to 120 characters.
  const name = normaliseOrganizationName(typed);
  if (!name.ok) return refuse(name.error);
  const filter = trainingFilterFromQuery(String(formData.get("query") ?? ""));

  try {
    const db = await getDatabase();
    // Without admin/0013 an incomplete frame would be stored without its mark: refuse instead.
    if (filter.includeUnboxed && !(await db.trainingSupportsUnboxed())) {
      return refuse(
        "Apply admin/0013_training_unboxed_frames.sql in the SQL editor to include frames with unboxed eggs.",
      );
    }
    const frames = await db.trainingFrames({
      startedFrom: filter.from,
      startedTo: filter.to,
      organizationIds: filter.organizationIds,
      modelVersions: filter.modelVersions,
    });
    const { items, summary } = buildTrainingSet(frames, filter);
    if (items.length === 0) return refuse("These filters keep no frame.");
    if (items.length > TRAINING_SNAPSHOT_LIMIT) {
      return refuse(
        `A snapshot holds at most ${TRAINING_SNAPSHOT_LIMIT.toLocaleString()} frames. Narrow the filters.`,
      );
    }
    await (
      await getAdminWrites()
    ).createTrainingSnapshot({ name: name.name, filter, summary, items });
    revalidatePath("/training-data");
    return {
      error: null,
      done: `Created “${name.name}”: ${items.length.toLocaleString()} frames, ${summary.boxes.toLocaleString()} boxes.`,
      name: "",
    };
  } catch (cause) {
    if (cause instanceof MigrationNotAppliedError) return refuse(cause.message);
    if (cause instanceof AdminWriteError) {
      const messages = {
        forbidden: NOT_PERMITTED,
        conflict: "A frame appeared twice. Preview again and retry.",
        not_found: "A frame no longer exists. Preview again.",
        invalid:
          cause.hint === "stale"
            ? "A frame was deleted since the preview. Preview again and retry."
            : "That snapshot is not allowed: check its name and size.",
        failed: "The snapshot could not be saved. Try again.",
      } as const;
      return refuse(messages[cause.reason]);
    }
    throw cause;
  }
}
