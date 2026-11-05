// admin/0015 · console_area_prevalence('town', …): a city's barangays, counted as the map counts
// the city, withheld below 5, scoped like the map, and agreeing with the app's own
// barangay_prevalence().
import type { ReservedSQL } from "bun";

type Kind = "positive" | "negative" | "rejected" | "unread" | "deleted";
type Figure = { examined: number | null; positive: number | null; suppressed: boolean };
type Child = Figure & { code: string; name: string | null };
type Result = {
  level: string;
  code: string | null;
  name: string;
  parents: { level: string; code: string; name: string }[];
  figure: Figure;
  unplaced: number | null;
  children: Child[];
};

const VII = "0700000000";
const CEBU = "0702200000";
const TALISAY = "0702250000";
const BAGO = "1804502000";
const MANILA = "1380600000";
const MINGLANILLA = "0702232000";
const TOLEDO = "0702251000";

export default async function test(sql: ReservedSQL) {
  const one = async <T>(query: Promise<unknown>) => ((await query) as T[])[0] as T;
  const check = (condition: boolean, message: string) => {
    if (!condition) throw new Error(`FAILED: ${message}`);
  };
  const same = (figure: Figure | undefined, examined: number | null, positive: number | null) =>
    figure !== undefined &&
    figure.examined === examined &&
    figure.positive === positive &&
    figure.suppressed === (examined === null);

  // ── Fixture ──
  const users = await one<Record<string, string>>(sql`
    select tests.create_user('s15@example.test', 'admin') as super_admin,
           tests.create_user('admin.a15@example.test')    as admin_a,
           tests.create_user('tech.a15@example.test')     as tech_a,
           tests.create_user('tech.b15@example.test')     as tech_b`);
  await sql`select tests.act_as(${users.super_admin}::uuid)`;
  const labs = await one<{ lab_a: string; lab_b: string }>(sql`
    select public.console_create_organization('Barangay Lab A') as lab_a,
           public.console_create_organization('Barangay Lab B') as lab_b`);
  await sql`select tests.act_as_owner()`;
  await sql`
    insert into public.organization_members (user_id, organization_id, role) values
      (${users.admin_a}::uuid, ${labs.lab_a}::uuid, 'org_admin'),
      (${users.tech_a}::uuid, ${labs.lab_a}::uuid, 'medtech'),
      (${users.tech_b}::uuid, ${labs.lab_b}::uuid, 'medtech')`;

  const patient = async (barangay: string, tech: string) =>
    (
      await one<{ id: string }>(sql`
        insert into public.patients (lastname, firstname, sex, birthdate, psgc_barangay_code, created_by)
        values ('Barangay', ${barangay}, 'M', '2015-01-01', ${barangay}, ${tech}::uuid) returning id`)
    ).id;
  const session = async (
    patientId: string,
    tech: string,
    kind: Kind,
    at = "2026-09-10T02:00:00Z",
  ) => {
    const row = await one<{ id: string }>(sql`
      insert into public.sessions (user_id, patient_id, device_id, started_at)
      values (${tech}::uuid, ${patientId}::uuid, 'd', ${at}::timestamptz) returning id`);
    if (kind === "unread") return;
    const sample = await one<{ id: string }>(sql`
      insert into public.samples (session_id, user_id, captured_at, storage_path, inference_model_version, deleted_at)
      values (${row.id}::uuid, ${tech}::uuid, ${at}::timestamptz, 'x', 'v',
              ${kind === "deleted" ? at : null}::timestamptz) returning id`);
    if (kind === "negative") return;
    await sql`
      insert into public.detections (sample_id, class_label, confidence, verdict)
      values (${sample.id}::uuid, 'Trichuris', 0.9,
              ${kind === "rejected" ? "FALSE_POSITIVE" : "CONFIRMED"})`;
  };
  const many = async (patientId: string, tech: string, kinds: Kind[], at?: string) => {
    for (const kind of kinds) await session(patientId, tech, kind, at);
  };

  const a = users.tech_a;
  const b = users.tech_b;
  // Lab A, in the City of Talisay
  await many(await patient("0702250001", a), a, [
    "positive",
    "positive",
    "positive",
    "negative",
    "negative",
    "rejected",
    "unread",
    "deleted",
  ]); // 6 examined, 3 positive
  await many(await patient("0702250002", a), a, ["positive", "negative"]); // 2: withheld
  const dumlog = await patient("0702250003", a);
  await many(dumlog, a, ["negative", "negative", "negative", "negative", "negative"]); // 5, none
  await session(dumlog, a, "positive", "2026-10-02T02:00:00Z"); // October
  await many(await patient("0702250999", a), a, ["positive"]); // a code not in the release
  // Lab B, in Talisay too
  await many(await patient("0702250001", b), b, ["positive", "negative"]);
  // Elsewhere
  await many(await patient("0604502001", a), a, [
    "positive",
    "positive",
    "negative",
    "negative",
    "negative",
  ]); // a 2023 Negros Occidental code: City of Bago
  await many(await patient("1380601001", a), a, [
    "negative",
    "negative",
    "negative",
    "negative",
    "positive",
  ]); // the City of Manila, under a district
  // One barangay withheld among shown ones: the smallest shown one is withheld with it.
  await many(await patient("0702232001", a), a, [
    "positive",
    "positive",
    "positive",
    "negative",
    "negative",
    "negative",
    "negative",
  ]); // Minglanilla: 7 examined, 3 positive
  await many(await patient("0702232002", a), a, [
    "positive",
    "negative",
    "negative",
    "negative",
    "negative",
  ]); // 5 examined, 1 positive: shown alone, withheld beside one small barangay
  await many(await patient("0702232003", a), a, ["positive", "negative"]); // 2: withheld
  // One shown and one withheld: both withheld, the town still shows its total.
  await many(await patient("0702251001", a), a, [
    "negative",
    "negative",
    "negative",
    "negative",
    "negative",
    "positive",
  ]); // Toledo: 6
  await many(await patient("0702251002", a), a, ["negative", "negative", "negative"]); // 3

  const read = async (
    caller: string,
    level: string,
    code: string | null,
    organization: string | null = null,
    from: string | null = "2026-09-01",
    to: string | null = "2026-09-30",
  ) => {
    await sql`select tests.act_as(${caller}::uuid)`;
    const row = await one<{ r: Result }>(sql`
      select public.console_area_prevalence(${level}, ${code}, ${organization}::uuid,
                                            ${from}::date, ${to}::date) as r`);
    return typeof row.r === "string" ? (JSON.parse(row.r) as Result) : row.r;
  };
  const child = (result: Result, code: string) => result.children.find((c) => c.code === code);

  // ── The town and its barangays, everything, September ──
  const talisay = await read(users.super_admin, "town", TALISAY);
  check(talisay.name.length > 0, "a town names itself");
  check(
    talisay.parents.length === 2 &&
      talisay.parents[0].level === "region" &&
      talisay.parents[0].code === VII &&
      talisay.parents[1].level === "province" &&
      talisay.parents[1].code === CEBU,
    `a town names its region and province (${JSON.stringify(talisay.parents)})`,
  );
  check(
    same(talisay.figure, 16, 6),
    `Talisay: 16 examined, 6 positive (${JSON.stringify(talisay.figure)})`,
  );
  check(talisay.unplaced === null, "only the country reports smears not placed");
  const cebu = await read(users.super_admin, "province", CEBU);
  check(
    JSON.stringify(child(cebu, TALISAY)) ===
      JSON.stringify({ code: TALISAY, name: child(cebu, TALISAY)?.name, ...talisay.figure }),
    "the town's own figure is the one its province's map shows",
  );
  check(
    talisay.children.map((c) => c.code).join() ===
      ["0702250001", "0702250002", "0702250003", "0702250999"].join(),
    `only barangays with a smear, by code (${talisay.children.map((c) => c.code).join()})`,
  );
  check(
    talisay.children.every((c) => c.name === null),
    "a barangay comes back with no name",
  );
  check(same(child(talisay, "0702250001"), 8, 4), "two laboratories' smears in one barangay");
  check(same(child(talisay, "0702250002"), null, null), "a barangay with 2 smears is withheld");
  check(same(child(talisay, "0702250003"), 5, 0), "5 smears, none positive, is shown as 0");
  check(same(child(talisay, "0702250999"), null, null), "a code not in the release is listed");
  check(
    talisay.children.every((c) => c.suppressed || (c.examined ?? 0) >= 5),
    "no barangay under 5 smears carries a count",
  );

  // ── A lone withheld barangay never stands alone ──
  const minglanilla = await read(users.super_admin, "town", MINGLANILLA);
  check(same(minglanilla.figure, 14, 5), "Minglanilla: 14 examined, 5 positive");
  check(same(child(minglanilla, "0702232001"), 7, 3), "the larger shown barangay stays shown");
  check(
    same(child(minglanilla, "0702232002"), null, null),
    "the smallest shown barangay is withheld beside the one small barangay",
  );
  check(same(child(minglanilla, "0702232003"), null, null), "the small barangay is withheld");
  const toledo = await read(users.super_admin, "town", TOLEDO);
  check(
    same(toledo.figure, 9, 1) &&
      toledo.children.length === 2 &&
      toledo.children.every((c) => c.suppressed),
    `one shown and one withheld: both withheld (${JSON.stringify(toledo.children)})`,
  );
  check(
    same(talisay.figure, 16, 6) && talisay.children.filter((c) => c.suppressed).length === 2,
    "two withheld already: nothing more is withheld",
  );

  // ── Renumbered and district codes ──
  const bago = await read(users.super_admin, "town", BAGO);
  check(
    bago.children.length === 1 && same(child(bago, "1804502001"), 5, 2),
    `a 2023 barangay code is listed under its current code (${JSON.stringify(bago.children)})`,
  );
  const manila = await read(users.super_admin, "town", MANILA);
  check(same(child(manila, "1380601001"), 5, 1), "a Manila barangay sits in the City of Manila");

  // ── Period ──
  const always = await read(users.super_admin, "town", TALISAY, null, null, null);
  check(same(child(always, "0702250003"), 6, 1), "without a period, October's smear counts");
  const october = await read(users.super_admin, "town", TALISAY, null, "2026-10-01", "2026-10-31");
  check(
    october.children.length === 1 && same(child(october, "0702250003"), null, null),
    "October alone: one barangay with one smear, withheld",
  );

  // ── Scope ──
  const own = await read(users.admin_a, "town", TALISAY);
  check(same(own.figure, 14, 5), "an org admin sees their laboratory only");
  check(
    same(child(own, "0702250001"), 6, 3),
    "another laboratory's smears are not in the barangay",
  );
  const narrowed = await read(users.super_admin, "town", TALISAY, labs.lab_b);
  check(
    narrowed.children.length === 1 && same(child(narrowed, "0702250001"), null, null),
    "a super admin can narrow to one laboratory",
  );

  // ── The app's barangay_prevalence() agrees, wherever it shows a figure ──
  await sql`select tests.act_as(${users.super_admin}::uuid)`;
  const app = (await sql`
    select psgc_barangay_code as code, examined_smears as examined,
           positive_smears as positive, suppressed
    from public.barangay_prevalence()
    where psgc_barangay_code like '0702250%'
    order by psgc_barangay_code`) as Child[];
  check(app.length === 4, `the app lists the same four barangays (${app.length})`);
  for (const row of app) {
    check(
      same(child(always, row.code), row.examined, row.positive) &&
        child(always, row.code)?.suppressed === row.suppressed,
      `barangay ${row.code}: the map and barangay_prevalence() agree`,
    );
  }

  // ── Refusals ──
  const refused = async (caller: string, query: string, state: string, message: string) => {
    await sql`select tests.act_as(${caller}::uuid)`;
    await sql`select tests.expect_error(${query}, ${state}, ${message})`;
  };
  await refused(
    users.admin_a,
    `select public.console_area_prevalence('town', '${TALISAY}', '${labs.lab_b}')`,
    "42501",
    "an org admin cannot ask for another laboratory's barangays",
  );
  await refused(
    users.tech_a,
    `select public.console_area_prevalence('town', '${TALISAY}')`,
    "42501",
    "a medtech is refused",
  );
  await refused(
    users.super_admin,
    "select public.console_area_prevalence('town', '0702299000')",
    "P0002",
    "an unknown town",
  );
  await refused(
    users.super_admin,
    "select public.console_area_prevalence('town', null)",
    "P0002",
    "a town needs a code",
  );
  await refused(
    users.super_admin,
    "select public.console_area_prevalence('barangay', '0702250001')",
    "22023",
    "nothing below a barangay",
  );

  // ── Privileges unchanged ──
  await sql`select tests.act_as_owner()`;
  const grants = await one<Record<string, boolean>>(sql`
    select has_function_privilege('anon',
             'public.console_area_prevalence(text, text, uuid, date, date)', 'execute') as anon_map,
           has_function_privilege('authenticated',
             'public.console_area_prevalence(text, text, uuid, date, date)', 'execute') as map`);
  check(
    !grants.anon_map && grants.map,
    `still callable by signed-in users only (${JSON.stringify(grants)})`,
  );
}
