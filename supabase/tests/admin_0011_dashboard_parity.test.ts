// admin/0011 · console_dashboard_figures() agrees with summariseDashboard(), to the unit.
//
// One fixture, two counters: the database function, and the console's reference —
// `summariseSession` per session, then `summariseDashboard` — run on the same rows
// read back as the table owner. Every scope and period below must give identical
// figures. The fixture carries every rule the two could disagree on: a deleted
// duplicate, a rejected detection, an unread session, species aliases, spacing and
// case, an expert's correction, an empty label, two species in one smear, a patient
// in no laboratory, and sessions either side of Manila midnight and of a Monday.
import type { ReservedSQL } from "bun";
import {
  figuresFromTotals,
  parseDetectionVerdict,
  summariseDashboard,
  summariseSession,
  type DashboardFigures,
  type SmearRecord,
} from "../../src/domain";

type Detection = [classLabel: string, verdict: string, expertClass?: string];
interface Field {
  deleted?: boolean;
  detections: Detection[];
}
interface SessionSpec {
  patient: "a1" | "a2" | "b1" | "loner";
  at: string;
  fields: Field[];
}

const SESSIONS: SessionSpec[] = [
  // Lab A
  {
    patient: "a1",
    at: "2026-08-31T15:59:59Z",
    fields: [{ detections: [["Ascaris", "CONFIRMED"]] }],
  },
  {
    patient: "a1",
    at: "2026-08-31T16:00:00Z", // 1 Sept 00:00 Manila: inside September, week of 31 Aug
    fields: [{ detections: [["ascaris_lumbricoides", "CONFIRMED"]] }, { detections: [] }],
  },
  {
    patient: "a1",
    at: "2026-09-06T16:30:00Z", // Monday 7 Sept 00:30 Manila: the next week
    fields: [
      { deleted: true, detections: [["Hookworm", "CONFIRMED"]] },
      { detections: [["Hookworm", "FALSE_POSITIVE"]] },
    ],
  },
  {
    patient: "a2",
    at: "2026-09-06T15:59:00Z", // Sunday 6 Sept 23:59 Manila: still the week of 31 Aug
    fields: [
      {
        detections: [
          [" trichuris ", "WRONG_CLASS", "Hook worm"],
          ["TRICHURIS_TRICHIURA", "BOX_INCORRECT"],
          ["Trichuris", "CONFIRMED"],
        ],
      },
      { detections: [["Hookworm", "CONFIRMED"]] },
    ],
  },
  { patient: "a2", at: "2026-09-10T02:00:00Z", fields: [] }, // opened, never read
  {
    patient: "a2",
    at: "2026-09-20T02:00:00Z", // only a deleted duplicate: not examined
    fields: [{ deleted: true, detections: [["Ascaris", "CONFIRMED"]] }],
  },
  {
    patient: "a2",
    at: "2026-09-30T15:59:59Z", // 30 Sept 23:59:59 Manila: inside September
    fields: [{ detections: [["Ascaris lumbricoides", "FALSE_POSITIVE"]] }],
  },
  {
    patient: "a1",
    at: "2026-09-30T16:00:00Z", // 1 Oct 00:00 Manila: outside September
    fields: [{ detections: [["Hookworm", "CONFIRMED"]] }],
  },
  // Lab B
  {
    patient: "b1",
    at: "2026-09-02T01:00:00Z",
    fields: [
      {
        detections: [
          ["Strongyloides  ", "CONFIRMED"],
          ["", "CONFIRMED"],
        ],
      },
      { detections: [] },
      { detections: [] },
    ],
  },
  { patient: "b1", at: "2026-09-15T01:00:00Z", fields: [{ detections: [] }] },
  // A patient whose registrar is in no laboratory
  {
    patient: "loner",
    at: "2026-09-03T00:00:00Z",
    fields: [{ detections: [["Hookworm", "CONFIRMED"]] }],
  },
];

export default async function test(sql: ReservedSQL) {
  const one = async <T>(query: Promise<unknown>) => ((await query) as T[])[0] as T;

  // ── Fixture, through the console's own functions where it has them ──
  const users = await one<Record<string, string>>(sql`
    select tests.create_user('s11@example.test', 'admin') as super_admin,
           tests.create_user('admin.a11@example.test')    as admin_a,
           tests.create_user('tech.a11@example.test')     as tech_a,
           tests.create_user('tech.b11@example.test')     as tech_b,
           tests.create_user('loner11@example.test')      as loner`);
  await sql`select tests.act_as(${users.super_admin}::uuid)`;
  const labs = await one<{ lab_a: string; lab_b: string }>(sql`
    select public.console_create_organization('Totals Lab A') as lab_a,
           public.console_create_organization('Totals Lab B') as lab_b`);
  await sql`select tests.act_as_owner()`;
  await sql`
    insert into public.organization_members (user_id, organization_id, role) values
      (${users.admin_a}::uuid, ${labs.lab_a}::uuid, 'org_admin'),
      (${users.tech_a}::uuid, ${labs.lab_a}::uuid, 'medtech'),
      (${users.tech_b}::uuid, ${labs.lab_b}::uuid, 'medtech')`;

  const registrar = { a1: users.tech_a, a2: users.tech_a, b1: users.tech_b, loner: users.loner };
  const patients: Record<string, string> = {};
  for (const [key, createdBy] of Object.entries(registrar)) {
    const row = await one<{ id: string }>(sql`
      insert into public.patients (lastname, firstname, sex, birthdate, psgc_barangay_code, created_by)
      values ('Totals', ${key}, 'F', '2012-01-01', '0722217001', ${createdBy}::uuid)
      returning id`);
    patients[key] = row.id;
  }

  for (const spec of SESSIONS) {
    const session = await one<{ id: string }>(sql`
      insert into public.sessions (user_id, patient_id, device_id, started_at)
      values (${registrar[spec.patient]}::uuid, ${patients[spec.patient]}::uuid, 'd', ${spec.at}::timestamptz)
      returning id`);
    for (const field of spec.fields) {
      const sample = await one<{ id: string }>(sql`
        insert into public.samples (session_id, user_id, captured_at, storage_path, inference_model_version, deleted_at)
        values (${session.id}::uuid, ${registrar[spec.patient]}::uuid, ${spec.at}::timestamptz, 'x', 'v',
                ${field.deleted ? spec.at : null}::timestamptz)
        returning id`);
      for (const [classLabel, verdict, expertClass] of field.detections) {
        await sql`
          insert into public.detections (sample_id, class_label, confidence, verdict, expert_class)
          values (${sample.id}::uuid, ${classLabel}, 0.9, ${verdict}, ${expertClass ?? null})`;
      }
    }
  }

  // ── The reference: every session read back as the owner, counted by the console ──
  type Row = { id: string; patient_id: string; started_at: Date; organization_id: string | null };
  const sessions = (await sql`
    select se.id, se.patient_id, se.started_at, po.organization_id
    from public.sessions se
    left join public.patient_organizations po on po.patient_id = se.patient_id`) as Row[];
  const samples = (await sql`select id, session_id, deleted_at from public.samples`) as {
    id: string;
    session_id: string;
    deleted_at: Date | null;
  }[];
  const detections = (await sql`
    select sample_id, verdict, class_label, expert_class from public.detections`) as {
    sample_id: string;
    verdict: string;
    class_label: string;
    expert_class: string | null;
  }[];

  function reference(organizationId: string | null, from?: string, to?: string): DashboardFigures {
    // listSmears' bounds: Manila calendar days, inclusive.
    const lower = from ? Date.parse(`${from}T00:00:00+08:00`) : -Infinity;
    const upper = to ? Date.parse(`${to}T23:59:59.999+08:00`) : Infinity;
    const records: SmearRecord[] = sessions
      .filter((session) => organizationId === null || session.organization_id === organizationId)
      .filter((session) => {
        const at = session.started_at.getTime();
        return at >= lower && at <= upper;
      })
      .map((session) => {
        const own = samples.filter((sample) => sample.session_id === session.id);
        const ids = new Set(own.map((sample) => sample.id));
        return {
          sessionId: session.id,
          patientId: session.patient_id,
          startedAt: session.started_at.toISOString(),
          barangayCode: "",
          summary: summariseSession({
            samples: own.map((sample) => ({
              id: sample.id,
              deletedAt: sample.deleted_at?.toISOString() ?? null,
            })),
            detections: detections
              .filter((detection) => ids.has(detection.sample_id))
              .map((detection) => ({
                sampleId: detection.sample_id,
                verdict: parseDetectionVerdict(detection.verdict),
                classLabel: detection.class_label,
                expertClass: detection.expert_class,
              })),
            findings: [],
          }),
        };
      });
    return summariseDashboard(records);
  }

  async function database(
    caller: string,
    organizationId: string | null,
    from?: string,
    to?: string,
  ): Promise<DashboardFigures> {
    await sql`select tests.act_as(${caller}::uuid)`;
    const row = await one<{ figures: Record<string, unknown> }>(sql`
      select public.console_dashboard_figures(${organizationId}::uuid, ${from ?? null}::date, ${to ?? null}::date) as figures`);
    await sql`select tests.act_as_owner()`;
    const raw = (typeof row.figures === "string" ? JSON.parse(row.figures) : row.figures) as {
      sessions: number;
      patients: number;
      smears_examined: number;
      positive_smears: number;
      fields_verified: number;
      trend: { week_start: string; examined: number; positive: number }[];
      species: { species: string; positive_smears: number }[];
    };
    return figuresFromTotals({
      sessions: raw.sessions,
      patients: raw.patients,
      smearsExamined: raw.smears_examined,
      positiveSmears: raw.positive_smears,
      fieldsVerified: raw.fields_verified,
      trend: raw.trend.map((point) => ({
        weekStart: point.week_start,
        examined: point.examined,
        positive: point.positive,
      })),
      species: raw.species.map((entry) => ({
        species: entry.species,
        positiveSmears: entry.positive_smears,
      })),
    });
  }

  const cases: [string, string, string | null, string | null, string?, string?][] = [
    ["super admin, every laboratory, all time", users.super_admin, null, null],
    [
      "super admin, every laboratory, September",
      users.super_admin,
      null,
      null,
      "2026-09-01",
      "2026-09-30",
    ],
    [
      "super admin, Lab A, September",
      users.super_admin,
      labs.lab_a,
      labs.lab_a,
      "2026-09-01",
      "2026-09-30",
    ],
    ["super admin, Lab B, all time", users.super_admin, labs.lab_b, labs.lab_b],
    ["org admin, own laboratory, all time", users.admin_a, labs.lab_a, labs.lab_a],
    ["org admin, no laboratory named: their own", users.admin_a, null, labs.lab_a, "2026-09-01"],
    ["org admin, open start", users.admin_a, labs.lab_a, labs.lab_a, undefined, "2026-09-06"],
  ];
  for (const [name, caller, asked, expectedScope, from, to] of cases) {
    const actual = await database(caller, asked, from, to);
    const expected = reference(expectedScope, from, to);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `FAILED: ${name}\n  database:  ${JSON.stringify(actual)}\n  reference: ${JSON.stringify(expected)}`,
      );
    }
  }

  // The fixture must actually exercise the rules, or agreement proves nothing.
  const september = reference(labs.lab_a, "2026-09-01", "2026-09-30");
  const check = (condition: boolean, message: string) => {
    if (!condition) throw new Error(`FAILED: ${message} (${JSON.stringify(september)})`);
  };
  check(september.smearsExamined === 4, "Lab A September: four examined smears");
  check(september.positiveSmears === 2, "Lab A September: two positive");
  check(september.fieldsVerified === 6, "Lab A September: six live fields");
  check(
    JSON.stringify(september.speciesMix.map((row) => [row.species, row.positiveSmears])) ===
      JSON.stringify(
        [
          ["Hookworm", 1],
          ["Ascaris lumbricoides", 1],
          ["Trichuris trichiura", 1],
        ].sort((l, r) => (l[0] < r[0] ? -1 : 1)),
      ),
    "Lab A September: aliases and the expert's correction counted once per smear",
  );
  check(
    JSON.stringify(september.trend.map((point) => [point.weekStart, point.examined])) ===
      JSON.stringify([
        ["2026-08-31", 2],
        ["2026-09-07", 1],
        ["2026-09-28", 1],
      ]),
    "Lab A September: Manila weeks starting Monday",
  );
}
