// admin/0012 · training snapshots: the console's label rules on rows the database returns,
// frozen snapshots, the split, the audit entries, and who may do any of it.
//
// The fixture holds every case the rules distinguish: each verdict, an untouched model box, a
// redrawn box, an egg the medtech added, a counted egg never boxed, a species the model is not
// trained on, a frame flagged for re-annotation, a background frame, a deleted duplicate, two
// laboratories, two model versions, and patients enough to fill each split.
import type { ReservedSQL } from "bun";
import {
  DEFAULT_TRAINING_FILTER,
  TRAINING_SPLITS,
  buildTrainingSet,
  splitFor,
  type TrainingFilter,
} from "../../src/domain";
import {
  parsed,
  toSnapshotItemsPayload,
  toTrainingFrames,
  toTrainingSnapshot,
  type TrainingFramesRow,
  type TrainingSnapshotRow,
} from "../../src/adapters/supabase/training-rows";

type Box = [number, number, number, number];
interface DetectionSpec {
  verdict: "CONFIRMED" | "FALSE_POSITIVE" | "WRONG_CLASS" | "BOX_INCORRECT";
  label: string;
  expert?: string;
  /** The detection's own box; `null` for none. Defaults to the prediction's box. */
  box?: Box | null;
  /** The model's prediction; absent for an egg the medtech added. */
  predicted?: Box;
}
interface FrameSpec {
  key: string;
  patient: string;
  model?: string;
  deleted?: boolean;
  reannotate?: boolean;
  at?: string;
  detections: DetectionSpec[];
}

const B: Box = [320, 320, 40, 30];

const FRAMES: FrameSpec[] = [
  // Lab A
  {
    key: "confirmed",
    patient: "p1",
    detections: [{ verdict: "CONFIRMED", label: "Ascaris", predicted: B }],
  },
  {
    key: "wrong-class",
    patient: "p1",
    detections: [{ verdict: "WRONG_CLASS", label: "Ascaris", expert: "Hookworm", predicted: B }],
  },
  {
    key: "redrawn",
    patient: "p2",
    detections: [
      {
        verdict: "BOX_INCORRECT",
        label: "Trichuris",
        predicted: [100, 100, 20, 20],
        box: [110, 120, 30, 30],
      },
    ],
  },
  {
    key: "rejected",
    patient: "p2",
    detections: [
      { verdict: "FALSE_POSITIVE", label: "Hookworm", predicted: [500, 500, 24, 24] },
      { verdict: "CONFIRMED", label: "hookworm", box: [50, 60, 30, 30] },
    ],
  },
  { key: "background", patient: "p3", detections: [] },
  {
    key: "no-box",
    patient: "p3",
    detections: [
      { verdict: "CONFIRMED", label: "Ascaris", predicted: B },
      { verdict: "BOX_INCORRECT", label: "Ascaris", predicted: [200, 200, 20, 20], box: null },
    ],
  },
  {
    key: "odd-class",
    patient: "p4",
    detections: [{ verdict: "CONFIRMED", label: "test egg", box: B }],
  },
  {
    key: "flagged",
    patient: "p4",
    reannotate: true,
    detections: [{ verdict: "CONFIRMED", label: "Trichuris", predicted: B }],
  },
  {
    key: "duplicate",
    patient: "p5",
    deleted: true,
    detections: [{ verdict: "CONFIRMED", label: "Ascaris", predicted: B }],
  },
  {
    key: "model-v2",
    patient: "p5",
    model: "yolo-v2",
    detections: [{ verdict: "CONFIRMED", label: "Trichuris", predicted: B }],
  },
  // Lab B
  {
    key: "lab-b",
    patient: "q1",
    detections: [{ verdict: "CONFIRMED", label: "Hookworm", predicted: B }],
  },
  {
    key: "lab-b-old",
    patient: "q2",
    at: "2026-01-05T02:00:00Z",
    detections: [{ verdict: "CONFIRMED", label: "Hookworm", predicted: B }],
  },
];

export default async function test(sql: ReservedSQL) {
  const one = async <T>(query: Promise<unknown>) => ((await query) as T[])[0] as T;
  const check = (condition: boolean, message: string) => {
    if (!condition) throw new Error(`FAILED: ${message}`);
  };
  const refused = async (statement: () => Promise<unknown>, sqlstate: string, message: string) => {
    await sql`savepoint refusal`;
    try {
      await statement();
    } catch (cause) {
      await sql`rollback to savepoint refusal`;
      const code =
        (cause as { errno?: string; code?: string }).errno ?? (cause as { code?: string }).code;
      check(
        code === sqlstate,
        `${message} (expected ${sqlstate}, got ${code}: ${(cause as Error).message})`,
      );
      return;
    }
    throw new Error(`FAILED: ${message} (expected ${sqlstate}, statement succeeded)`);
  };

  // ── Fixture ──
  const users = await one<Record<string, string>>(sql`
    select tests.create_user('s12@example.test', 'admin') as super_admin,
           tests.create_user('admin.a12@example.test')    as admin_a,
           tests.create_user('tech.a12@example.test')     as tech_a,
           tests.create_user('tech.b12@example.test')     as tech_b`);
  await sql`select tests.act_as(${users.super_admin}::uuid)`;
  const labs = await one<{ lab_a: string; lab_b: string }>(sql`
    select public.console_create_organization('Training Lab A') as lab_a,
           public.console_create_organization('Training Lab B') as lab_b`);
  await sql`select tests.act_as_owner()`;
  await sql`
    insert into public.organization_members (user_id, organization_id, role) values
      (${users.admin_a}::uuid, ${labs.lab_a}::uuid, 'org_admin'),
      (${users.tech_a}::uuid, ${labs.lab_a}::uuid, 'medtech'),
      (${users.tech_b}::uuid, ${labs.lab_b}::uuid, 'medtech')`;

  const patients: Record<string, string> = {};
  const sessions: Record<string, string> = {};
  for (const key of ["p1", "p2", "p3", "p4", "p5", "q1", "q2"]) {
    const registrar = key.startsWith("q") ? users.tech_b : users.tech_a;
    const patient = await one<{ id: string }>(sql`
      insert into public.patients (lastname, firstname, sex, birthdate, psgc_barangay_code, created_by)
      values ('Training', ${key}, 'M', '2015-01-01', '0722217001', ${registrar}::uuid)
      returning id`);
    patients[key] = patient.id;
  }

  const samples: Record<string, string> = {};
  for (const spec of FRAMES) {
    const registrar = spec.patient.startsWith("q") ? users.tech_b : users.tech_a;
    const at = spec.at ?? "2026-10-01T02:00:00Z";
    const sessionKey = `${spec.patient}@${at}`;
    sessions[sessionKey] ??= (
      await one<{ id: string }>(sql`
        insert into public.sessions (user_id, patient_id, device_id, started_at)
        values (${registrar}::uuid, ${patients[spec.patient]}::uuid, 'd', ${at}::timestamptz)
        returning id`)
    ).id;
    const sample = await one<{ id: string }>(sql`
      insert into public.samples (session_id, user_id, captured_at, storage_path, inference_model_version,
                                  needs_reannotation, deleted_at)
      values (${sessions[sessionKey]}::uuid, ${registrar}::uuid, ${at}::timestamptz, 'pending',
              ${spec.model ?? "yolo-v1"}, ${spec.reannotate ?? false},
              ${spec.deleted ? at : null}::timestamptz)
      returning id`);
    samples[spec.key] = sample.id;
    await sql`update public.samples set storage_path = ${`${registrar}/${sample.id}.jpg`} where id = ${sample.id}::uuid`;

    let ordinal = 0;
    for (const detection of spec.detections) {
      let predictionId: string | null = null;
      if (detection.predicted) {
        const [x, y, w, h] = detection.predicted;
        predictionId = (
          await one<{ id: string }>(sql`
            insert into public.predictions (id, sample_id, ordinal, class_label, confidence, bbox_x, bbox_y, bbox_w, bbox_h)
            values (gen_random_uuid(), ${sample.id}::uuid, ${ordinal}, ${detection.label}, 0.9, ${x}, ${y}, ${w}, ${h})
            returning id`)
        ).id;
        ordinal += 1;
      }
      const box = detection.box === undefined ? (detection.predicted ?? null) : detection.box;
      await sql`
        insert into public.detections (sample_id, class_label, confidence, verdict, expert_class, prediction_id,
                                       bbox_x, bbox_y, bbox_w, bbox_h)
        values (${sample.id}::uuid, ${detection.label}, 0.9, ${detection.verdict}, ${detection.expert ?? null},
                ${predictionId}::uuid, ${box?.[0] ?? null}, ${box?.[1] ?? null}, ${box?.[2] ?? null}, ${box?.[3] ?? null})`;
    }
  }

  // An array as a Postgres array literal: the driver sends a bare JS array as one value.
  const literal = (values?: string[]) =>
    values ? `{${values.map((v) => `"${v}"`).join(",")}}` : null;
  async function frames(
    args: { from?: string; to?: string; labs?: string[]; models?: string[] } = {},
  ) {
    const row = await one<{ result: unknown }>(sql`
      select public.console_training_frames(${args.from ?? null}::date, ${args.to ?? null}::date,
                                            ${literal(args.labs)}::uuid[], ${literal(args.models)}::text[]) as result`);
    return toTrainingFrames(parsed<TrainingFramesRow>(row.result));
  }
  const filter = (overrides: Partial<TrainingFilter> = {}): TrainingFilter => ({
    ...DEFAULT_TRAINING_FILTER,
    ...overrides,
  });

  // ── The label rules on what the database returns ──
  await sql`select tests.act_as(${users.super_admin}::uuid)`;
  const all = await frames();
  check(all.deleted === 1, "the deleted duplicate is counted, not returned");
  check(all.frames.length === FRAMES.length - 1, "every live frame is returned");
  check(
    !all.frames.some((frame) => frame.sampleId === samples.duplicate),
    "no deleted frame is returned",
  );

  const { items, summary } = buildTrainingSet(all, filter());
  const kept = new Set(items.map((item) => item.sampleId));
  for (const key of [
    "confirmed",
    "wrong-class",
    "redrawn",
    "rejected",
    "background",
    "model-v2",
    "lab-b",
    "lab-b-old",
  ]) {
    check(kept.has(samples[key]!), `${key} is in the snapshot`);
  }
  for (const key of ["no-box", "odd-class", "flagged", "duplicate"]) {
    check(!kept.has(samples[key]!), `${key} is left out`);
  }
  check(summary.boxes === 7, `seven labelled boxes, got ${summary.boxes}`);
  check(summary.hardNegatives === 1, "one hard negative");
  check(summary.background === 1, "one background frame");
  check(
    JSON.stringify(summary.excludedFrames) ===
      JSON.stringify([
        { reason: "deleted_duplicate", frames: 1 },
        { reason: "needs_reannotation", frames: 1 },
        { reason: "unrecognised_class", frames: 1 },
        { reason: "counted_without_box", frames: 1 },
      ]),
    `exclusions by reason: ${JSON.stringify(summary.excludedFrames)}`,
  );
  check(summary.unrecognisedClasses.join() === "test egg", "the odd class is named");

  const byId = new Map(items.map((item) => [item.sampleId, item]));
  const confirmed = byId.get(samples.confirmed!)!;
  check(
    confirmed.labels.length === 1 &&
      confirmed.labels[0]!.class === "Ascaris lumbricoides" &&
      confirmed.labels[0]!.origin === "kept",
    "an untouched confirmed box is a label, kept",
  );
  check(
    byId.get(samples["wrong-class"]!)!.labels[0]!.class === "Hookworm",
    "a wrong class takes the medtech's species",
  );
  const redrawn = byId.get(samples.redrawn!)!.labels[0]!;
  check(
    redrawn.origin === "redrawn" && redrawn.x === 110 && redrawn.y === 120,
    "a redrawn box is where the medtech drew it",
  );
  const rejected = byId.get(samples.rejected!)!;
  check(
    rejected.labels.length === 1 && rejected.labels[0]!.origin === "added",
    "an added egg is a label, added",
  );
  check(
    rejected.hardNegatives.length === 1 && rejected.hardNegatives[0]!.x === 500,
    "a rejected box is a hard negative at the model's position",
  );
  const labCodes = new Set(items.map((item) => item.labCode));
  check(
    labCodes.size === 2 && [...labCodes].every((code) => /^LAB-[0-9A-F]{6}$/.test(code)),
    "laboratories are opaque codes",
  );

  // ── Filters ──
  check((await frames({ labs: [labs.lab_b] })).frames.length === 2, "one laboratory");
  check((await frames({ models: ["yolo-v2"] })).frames.length === 1, "one model version");
  check(
    (await frames({ from: "2026-09-01" })).frames.every(
      (frame) => frame.sampleId !== samples["lab-b-old"],
    ),
    "a period",
  );
  const versions = (await sql`select * from public.console_training_model_versions()`) as {
    model_version: string;
  }[];
  check(
    versions.map((row) => row.model_version).join() === "yolo-v1,yolo-v2",
    "model versions, most frames first",
  );

  // ── Nothing that names anyone ──
  const raw = JSON.stringify(
    (await one<{ r: unknown }>(sql`select public.console_training_frames() as r`)).r,
  );
  for (const [name, value] of Object.entries({
    ...patients,
    tech_a: users.tech_a,
    tech_b: users.tech_b,
  })) {
    check(!raw.includes(value), `the frames name no ${name}`);
  }
  check(!raw.includes("Training") && !raw.includes("0722217001"), "no patient name or barangay");

  // ── Create, and the audit entry written with it ──
  const created = await one<{ id: string }>(sql`
    select public.console_create_training_snapshot('  Baseline   October ', ${filter()}::jsonb, ${summary}::jsonb,
                                                   ${toSnapshotItemsPayload(items)}::jsonb) as id`);
  const audit = await one<{
    action: string;
    details: { name: string; frames: number; boxes: number };
  }>(sql`
    select action, details from public.admin_audit_log
    where target_type = 'training_snapshot' and target_id = ${created.id} order by id desc limit 1`);
  check(audit?.action === "training.snapshot.create", "creating a snapshot is audited");
  check(
    audit.details.name === "Baseline October" &&
      audit.details.frames === items.length &&
      audit.details.boxes === 7,
    "the audit entry names the snapshot and its size",
  );

  const read = async () =>
    toTrainingSnapshot(
      parsed<TrainingSnapshotRow>(
        (
          await one<{ r: unknown }>(
            sql`select public.console_training_snapshot(${created.id}::uuid) as r`,
          )
        ).r,
      ),
    );
  const before = await read();
  check(
    before.frameCount === items.length && before.boxCount === 7,
    "the snapshot holds its frames and boxes",
  );
  check(
    before.items.every((item) => item.storagePath.endsWith(`/${item.sampleId}.jpg`)),
    "paths come from the samples",
  );
  check(
    before.items.every((item) => /^[0-9a-f]{12}$/.test(item.patientGroup)),
    "patients are group codes",
  );
  check(
    !JSON.stringify(before.items).includes(items[0]!.patientKey),
    "the patient key is not stored",
  );

  // No patient in two splits, and each patient where splitFor puts them.
  const groupSplit = new Map<string, string>();
  for (const item of before.items) {
    const seen = groupSplit.get(item.patientGroup);
    check(seen === undefined || seen === item.split, "no patient appears in more than one split");
    groupSplit.set(item.patientGroup, item.split);
  }
  for (const item of items) {
    check(
      splitFor(item.patientKey) ===
        before.items.find((frozen) => frozen.sampleId === item.sampleId)!.split,
      "each frame is in its patient's split",
    );
  }
  check(new Set(TRAINING_SPLITS).size === 3, "three splits");

  // ── Frozen: a medtech re-opening a sample changes nothing in the snapshot ──
  await sql`select tests.act_as_owner()`;
  await sql`update public.detections set verdict = 'FALSE_POSITIVE' where sample_id = ${samples.confirmed}::uuid`;
  await sql`update public.detections set bbox_x = 1, bbox_y = 1 where sample_id = ${samples.redrawn}::uuid`;
  await sql`update public.samples set deleted_at = now() where id = ${samples["lab-b"]}::uuid`;
  await sql`select tests.act_as(${users.super_admin}::uuid)`;
  const after = await read();
  check(
    JSON.stringify(after.items) === JSON.stringify(before.items),
    "a snapshot downloads the same after its sources are edited",
  );

  // A frame deleted since the preview refuses the next snapshot, whole.
  await refused(
    () => sql`select public.console_create_training_snapshot('Stale', ${filter()}::jsonb, ${summary}::jsonb,
                                                             ${toSnapshotItemsPayload(items)}::jsonb)`,
    "22023",
    "a snapshot naming a frame no longer live is refused",
  );
  await refused(
    () =>
      sql`select public.console_create_training_snapshot('x', '{}'::jsonb, '{}'::jsonb, ${toSnapshotItemsPayload(items.slice(0, 1))}::jsonb)`,
    "22023",
    "a one-letter name is refused",
  );
  await refused(
    () =>
      sql`select public.console_create_training_snapshot('Empty', '{}'::jsonb, '{}'::jsonb, '[]'::jsonb)`,
    "22023",
    "an empty snapshot is refused",
  );

  // ── Download: audited, and unknown snapshots refused ──
  await sql`select public.console_record_training_download(${created.id}::uuid)`;
  const download = await one<{ n: number }>(sql`
    select count(*)::int as n from public.admin_audit_log
    where action = 'training.snapshot.download' and target_id = ${created.id}`);
  check(download.n === 1, "a download is audited");
  await refused(
    () => sql`select public.console_record_training_download(gen_random_uuid())`,
    "P0002",
    "an unknown snapshot's download is refused",
  );
  await refused(
    () => sql`select public.console_training_snapshot(gen_random_uuid())`,
    "P0002",
    "an unknown snapshot is not found",
  );
  const listed = (await sql`select * from public.console_training_snapshots()`) as {
    id: string;
    box_count: number;
  }[];
  check(
    listed.length === 1 && listed[0]!.id === created.id && listed[0]!.box_count === 7,
    "the list shows the snapshot",
  );

  // ── Nobody but a super admin ──
  for (const who of ["admin_a", "tech_a"] as const) {
    await sql`select tests.act_as(${users[who]}::uuid)`;
    await refused(
      () => sql`select public.console_training_frames()`,
      "42501",
      `${who} cannot read frames`,
    );
    await refused(
      () => sql`select * from public.console_training_model_versions()`,
      "42501",
      `${who} cannot list versions`,
    );
    await refused(
      () => sql`select * from public.console_training_snapshots()`,
      "42501",
      `${who} cannot list snapshots`,
    );
    await refused(
      () => sql`select public.console_training_snapshot(${created.id}::uuid)`,
      "42501",
      `${who} cannot read a snapshot`,
    );
    await refused(
      () => sql`select public.console_record_training_download(${created.id}::uuid)`,
      "42501",
      `${who} cannot download`,
    );
    await refused(
      () =>
        sql`select public.console_create_training_snapshot('Mine', '{}'::jsonb, '{}'::jsonb, ${toSnapshotItemsPayload(items.slice(0, 1))}::jsonb)`,
      "42501",
      `${who} cannot create a snapshot`,
    );
    await refused(
      () => sql`select * from public.training_snapshots`,
      "42501",
      `${who} cannot read the table`,
    );
    await refused(
      () => sql`select * from public.training_snapshot_items`,
      "42501",
      `${who} cannot read the items`,
    );
  }
  await sql`select tests.act_as(${users.super_admin}::uuid)`;
  await refused(
    () => sql`select * from public.training_snapshot_items`,
    "42501",
    "not even a super admin reads the table directly",
  );

  await sql`select tests.act_as_owner()`;
  await sql`select set_config('request.jwt.claims', '', true)`;
  await sql.unsafe("set local role anon");
  await refused(
    () => sql`select public.console_training_frames()`,
    "42501",
    "an anonymous client is refused",
  );

  // ── Never changed, never deleted (C8) ──
  await sql`select tests.act_as_owner()`;
  await refused(
    () => sql`update public.training_snapshots set name = 'Renamed'`,
    "P0001",
    "a snapshot cannot be renamed",
  );
  await refused(
    () => sql`delete from public.training_snapshot_items`,
    "P0001",
    "a snapshot's frames cannot be deleted",
  );
  await refused(
    () => sql`update public.training_snapshot_items set split = 'train'`,
    "P0001",
    "a frame cannot change split",
  );
}
