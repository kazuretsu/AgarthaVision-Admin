import type { NextRequest } from "next/server";
import { getAdminWrites, getDatabase, getStorage } from "@/adapters/registry";
import { isAllowed } from "@/domain";
import { AdminWriteError, MigrationNotAppliedError } from "@/ports";
import { ANY_CONSOLE_USER, requireRouteAccess } from "@/lib/console-access";
import { MissingEnvironmentError } from "@/lib/env";
import { trainingZipFilename, trainingZipStream } from "@/lib/training-zip";
import { TRAINING_ACCESS } from "../../../access";

/**
 * A training snapshot's zip (14zcqntm62u). Super admins only: anyone else gets a 404,
 * as for the page. The download is recorded in the audit trail before a byte is
 * served; if it cannot be recorded, nothing is.
 *
 * The images are read as the signed-in super admin, whom the `samples` bucket's own
 * policy lets read every frame, and streamed into the zip under their sample id. The
 * storage path, which names the medtech, never leaves the server.
 */
export const dynamic = "force-dynamic";
/** Seconds. Streaming keeps memory flat; reading the images is what takes time. */
export const maxDuration = 300;

const json = (error: string, status: number) => Response.json({ error }, { status });

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ snapshotId: string }> },
) {
  const access = await requireRouteAccess(ANY_CONSOLE_USER);
  if ("response" in access) return access.response;
  if (!isAllowed(access.actor.access, TRAINING_ACCESS)) return json("Not found.", 404);

  const { snapshotId } = await params;
  let snapshot;
  try {
    snapshot = await (await getDatabase()).getTrainingSnapshot(snapshotId);
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return json(`Server is not configured: ${cause.variable} is not set.`, 503);
    }
    if (cause instanceof MigrationNotAppliedError) return json(cause.message, 503);
    console.error("training snapshot read failed", cause);
    return json("The snapshot could not be read. Try again.", 502);
  }
  if (!snapshot) return json("Not found.", 404);

  try {
    await (await getAdminWrites()).recordTrainingDownload(snapshot.id);
  } catch (cause) {
    if (cause instanceof AdminWriteError) {
      return json(
        "The download could not be recorded, so it was not produced.",
        cause.reason === "forbidden" ? 403 : cause.reason === "not_found" ? 404 : 503,
      );
    }
    throw cause;
  }

  const storage = await getStorage();
  const body = trainingZipStream(snapshot, (item) => storage.download(item.storagePath));
  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${trainingZipFilename(snapshot)}"`,
      // A snapshot never changes, but a download is a recorded act: never served from a cache.
      "Cache-Control": "no-store",
    },
  });
}
