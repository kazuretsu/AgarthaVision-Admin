// admin/0013 · a snapshot may keep a frame with eggs counted but never boxed, and freezes how many.
import type { ReservedSQL } from "bun";
import { DEFAULT_TRAINING_FILTER, buildTrainingSet } from "../../src/domain";
import {
  parsed,
  toSnapshotItemsPayload,
  toTrainingFrames,
  toTrainingSnapshot,
  type TrainingFramesRow,
  type TrainingSnapshotRow,
} from "../../src/adapters/supabase/training-rows";

export default async function test(sql: ReservedSQL) {
  const one = async <T>(query: Promise<unknown>) => ((await query) as T[])[0] as T;
  const check = (condition: boolean, message: string) => {
    if (!condition) throw new Error(`FAILED: ${message}`);
  };

  const users = await one<Record<string, string>>(sql`
    select tests.create_user('s13@example.test', 'admin') as super_admin,
           tests.create_user('tech.a13@example.test')     as tech`);
  const patient = await one<{ id: string }>(sql`
    insert into public.patients (lastname, firstname, sex, birthdate, psgc_barangay_code, created_by)
    values ('Unboxed', 'One', 'F', '2015-01-01', '0722217001', ${users.tech}::uuid) returning id`);
  const session = await one<{ id: string }>(sql`
    insert into public.sessions (user_id, patient_id, device_id, started_at)
    values (${users.tech}::uuid, ${patient.id}::uuid, 'd', '2026-10-01T02:00:00Z') returning id`);

  // One frame with a boxed egg and two counted but never boxed; one fully boxed frame.
  const frame = async (boxes: (number[] | null)[]) => {
    const sample = await one<{ id: string }>(sql`
      insert into public.samples (session_id, user_id, captured_at, storage_path, inference_model_version)
      values (${session.id}::uuid, ${users.tech}::uuid, now(), 'x', 'yolo-v1') returning id`);
    for (const box of boxes) {
      await sql`
        insert into public.detections (sample_id, class_label, confidence, verdict, bbox_x, bbox_y, bbox_w, bbox_h)
        values (${sample.id}::uuid, 'Ascaris', 0.9, 'CONFIRMED',
                ${box?.[0] ?? null}, ${box?.[1] ?? null}, ${box?.[2] ?? null}, ${box?.[3] ?? null})`;
    }
    return sample.id;
  };
  const partial = await frame([[100, 100, 40, 40], null, null]);
  const whole = await frame([[300, 300, 40, 40]]);

  await sql`select tests.act_as(${users.super_admin}::uuid)`;
  const version = await one<{ v: number }>(
    sql`select public.console_training_schema_version() as v`,
  );
  check(version.v === 13, "the schema says 13");

  const frames = toTrainingFrames(
    parsed<TrainingFramesRow>(
      (await one<{ r: unknown }>(sql`select public.console_training_frames() as r`)).r,
    ),
  );
  const off = buildTrainingSet(frames, DEFAULT_TRAINING_FILTER);
  check(
    !off.items.some((item) => item.sampleId === partial),
    "off by default: the frame is left out",
  );

  const filter = { ...DEFAULT_TRAINING_FILTER, includeUnboxed: true };
  const { items, summary } = buildTrainingSet(frames, filter);
  check(
    items.length === 2 && summary.incomplete === 1 && summary.unboxedEggs === 2,
    `on: both frames, one incomplete with two eggs (${JSON.stringify(summary)})`,
  );

  const created = await one<{ id: string }>(sql`
    select public.console_create_training_snapshot('With unboxed', ${filter}::jsonb, ${summary}::jsonb,
                                                   ${toSnapshotItemsPayload(items)}::jsonb) as id`);
  const snapshot = toTrainingSnapshot(
    parsed<TrainingSnapshotRow>(
      (
        await one<{ r: unknown }>(
          sql`select public.console_training_snapshot(${created.id}::uuid) as r`,
        )
      ).r,
    ),
  );
  const byId = new Map(snapshot.items.map((item) => [item.sampleId, item]));
  check(
    byId.get(partial)?.unboxedEggs === 2 && byId.get(partial)?.labels.length === 1,
    "the incomplete frame keeps its box and how many it lacks",
  );
  check(byId.get(whole)?.unboxedEggs === 0, "a complete frame lacks none");
  check(snapshot.boxCount === 2, "boxes count only the boxed eggs");

  // Frozen, the new column too.
  await sql`select tests.act_as_owner()`;
  await sql`savepoint frozen`;
  let refused = false;
  try {
    await sql`update public.training_snapshot_items set unboxed_eggs = 0`;
  } catch {
    refused = true;
    await sql`rollback to savepoint frozen`;
  }
  check(refused, "the count cannot be changed");

  // A medtech still cannot ask.
  await sql`select tests.act_as(${users.tech}::uuid)`;
  await sql`savepoint medtech`;
  let denied = false;
  try {
    await sql`select public.console_training_snapshot(${created.id}::uuid)`;
  } catch {
    denied = true;
    await sql`rollback to savepoint medtech`;
  }
  check(denied, "a medtech cannot read the snapshot");
}
