import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { DEFAULT_TRAINING_FILTER, DetectionVerdict, type TrainingSnapshot } from "@/domain";
import { trainingZipFilename, trainingZipStream } from "./training-zip";

const USER_ID = "7d3f0c1e-1111-4222-8333-944455556666";
const id = (n: number) => `5a1e0000-0000-4000-8000-00000000000${n}`;

const snapshot: TrainingSnapshot = {
  id: "c0ffee00-0000-4000-8000-000000000000",
  name: "Baseline / October!",
  createdByLabel: "Super Admin",
  createdAt: "2026-10-13T08:00:00.000Z",
  frameCount: 3,
  boxCount: 1,
  filter: { ...DEFAULT_TRAINING_FILTER },
  summary: null,
  items: [1, 2, 3].map((n) => ({
    sampleId: id(n),
    split: n === 3 ? "test" : "train",
    storagePath: `${USER_ID}/${id(n)}.jpg`,
    modelVersion: "yolo-v1",
    labCode: "LAB-ABCDEF",
    patientGroup: `group${n}`,
    needsReannotation: false,
    labels:
      n === 1
        ? [
            {
              class: "Trichuris trichiura",
              x: 320,
              y: 320,
              w: 64,
              h: 64,
              verdict: DetectionVerdict.Confirmed,
              modelClass: "Trichuris",
              origin: "kept",
            },
          ]
        : [],
    hardNegatives: [],
    unboxedEggs: 0,
  })),
};

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

describe("trainingZipStream", () => {
  it("writes each frame's image and labels, the metadata files, and lists a missing image", async () => {
    const read = async (item: TrainingSnapshot["items"][number]) => {
      if (item.sampleId === id(2)) throw new Error("gone");
      return new TextEncoder().encode(`jpeg:${item.sampleId}`);
    };
    const files = unzipSync(await collect(trainingZipStream(snapshot, read)));
    const names = Object.keys(files).sort();
    expect(names).toEqual(
      [
        "README.md",
        "annotations.coco.json",
        "data.yaml",
        `images/test/${id(3)}.jpg`,
        `images/train/${id(1)}.jpg`,
        `labels/test/${id(3)}.txt`,
        `labels/train/${id(1)}.txt`,
        "manifest.jsonl",
      ].sort(),
    );
    expect(strFromU8(files[`images/train/${id(1)}.jpg`]!)).toBe(`jpeg:${id(1)}`);
    expect(strFromU8(files[`labels/train/${id(1)}.txt`]!)).toBe(
      "1 0.500000 0.500000 0.100000 0.100000\n",
    );
    expect(strFromU8(files[`labels/test/${id(3)}.txt`]!)).toBe("");

    const manifest = strFromU8(files["manifest.jsonl"]!).trim().split("\n");
    expect(manifest.map((line) => (JSON.parse(line) as { sample_id: string }).sample_id)).toEqual([
      id(1),
      id(3),
    ]);
    expect(strFromU8(files["README.md"]!)).toContain(`\`${id(2)}\``);

    const everything = Object.values(files)
      .map((file) => strFromU8(file))
      .join("\n");
    expect(everything).not.toContain(USER_ID);
  });

  it("reads only a few images ahead of what it has written", async () => {
    let started = 0;
    const read = async () => {
      started += 1;
      return new Uint8Array([1]);
    };
    const reader = trainingZipStream(
      {
        ...snapshot,
        items: Array.from({ length: 30 }, (_, n) => ({ ...snapshot.items[0]!, sampleId: `s${n}` })),
      },
      read,
      4,
    ).getReader();
    await reader.read();
    expect(started).toBeLessThanOrEqual(8);
    await reader.cancel();
  });

  it("names the file from the snapshot's name and id", () => {
    expect(trainingZipFilename(snapshot)).toBe(
      "agarthavision-training-baseline-october-c0ffee00.zip",
    );
    expect(trainingZipFilename({ ...snapshot, name: "!!!" })).toBe(
      "agarthavision-training-snapshot-c0ffee00.zip",
    );
  });
});
