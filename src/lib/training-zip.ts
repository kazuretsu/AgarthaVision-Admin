import { Zip, ZipDeflate, ZipPassThrough } from "fflate";
import {
  toCocoJson,
  toDataCard,
  toDataYaml,
  toManifestLine,
  toYoloLabels,
  trainingImagePath,
  trainingLabelPath,
  type TrainingSnapshot,
  type TrainingSnapshotItem,
} from "@/domain";

/**
 * A training snapshot as a zip, streamed: each frame's image and YOLO label file in
 * snapshot order, then `data.yaml`, the COCO file, the manifest and the data card.
 *
 * Images are stored as they are (a JPEG does not compress again); text is deflated.
 * Reading runs a few images ahead of writing, and nothing is read until the response
 * asks for more, so a slow client never makes the server hold the whole file.
 *
 * An image that cannot be read is left out with its label file and manifest line, and
 * the data card lists it, so every file in the zip describes only what is in it.
 */
export function trainingZipStream(
  snapshot: TrainingSnapshot,
  readImage: (item: TrainingSnapshotItem) => Promise<Uint8Array>,
  readAhead = 6,
): ReadableStream<Uint8Array> {
  const { items } = snapshot;
  const classes = snapshot.filter.classes;
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let failure: unknown = null;
  let finished = false;

  const zip = new Zip((error, chunk, final) => {
    if (error) {
      failure = error;
      return;
    }
    chunks.push(chunk);
    if (final) finished = true;
  });

  const addText = (name: string, text: string) => {
    const file = new ZipDeflate(name, { level: 6 });
    zip.add(file);
    file.push(encoder.encode(text), true);
  };
  const addBytes = (name: string, bytes: Uint8Array) => {
    const file = new ZipPassThrough(name);
    zip.add(file);
    file.push(bytes, true);
  };

  const reads = new Map<number, Promise<Uint8Array | null>>();
  const read = (index: number) => {
    let pending = reads.get(index);
    if (!pending) {
      pending = readImage(items[index]!).catch(() => null);
      reads.set(index, pending);
    }
    return pending;
  };

  const written: TrainingSnapshotItem[] = [];
  const missing: string[] = [];
  let next = 0;
  let ended = false;

  /** Writes one more frame, or the closing files once every frame is written. */
  async function step() {
    if (next < items.length) {
      for (let ahead = next; ahead < Math.min(items.length, next + readAhead); ahead += 1) {
        void read(ahead);
      }
      const item = items[next]!;
      const bytes = await read(next);
      reads.delete(next);
      next += 1;
      if (bytes) {
        addBytes(trainingImagePath(item), bytes);
        addText(trainingLabelPath(item), toYoloLabels(item.labels, classes));
        written.push(item);
      } else {
        missing.push(item.sampleId);
      }
      return;
    }
    if (ended) throw new Error("The zip ended without its final chunk.");
    addText("data.yaml", toDataYaml(classes));
    addText("annotations.coco.json", toCocoJson(snapshot, written, classes));
    addText("manifest.jsonl", written.map((item) => toManifestLine(item, classes)).join(""));
    addText("README.md", toDataCard(snapshot, written, missing));
    zip.end();
    ended = true;
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (chunks.length === 0 && !finished && !failure) await step();
      } catch (cause) {
        failure = cause;
      }
      if (failure) {
        controller.error(failure);
        return;
      }
      while (chunks.length > 0) controller.enqueue(chunks.shift()!);
      if (finished) controller.close();
    },
  });
}

/** A file name for the download: the snapshot's name, made safe, and the start of its id. */
export function trainingZipFilename(snapshot: Pick<TrainingSnapshot, "id" | "name">): string {
  const slug =
    snapshot.name
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, "-")
      .slice(0, 60) || "snapshot";
  return `agarthavision-training-${slug}-${snapshot.id.slice(0, 8)}.zip`;
}
