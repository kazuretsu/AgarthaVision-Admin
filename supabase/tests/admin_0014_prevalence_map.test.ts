// admin/0014 · console_area_prevalence(): figures per region, province and town, small areas
// withheld at every level, scoped like the dashboard and agreeing with it.
import type { ReservedSQL } from "bun";

type Kind = "positive" | "negative" | "rejected" | "unread" | "deleted";
type Figure = { examined: number | null; positive: number | null; suppressed: boolean };
type Child = Figure & { code: string; name: string };
type Result = {
  level: string;
  code: string | null;
  name: string;
  parents: { level: string; code: string; name: string }[];
  figure: Figure;
  unplaced: number | null;
  children: Child[];
};

const CEBU = "0702200000";
const BOHOL = "0701200000";
const VII = "0700000000";
const NIR = "1800000000";
const NEGROS_OCC = "1804500000";
const BAGO = "1804502000";
const TALISAY = "0702250000";
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

  // ── The lookup ──
  const counts = await one<Record<string, number>>(sql`
    select (select count(*) from public.psgc_regions)::int      as regions,
           (select count(*) from public.psgc_provinces)::int    as provinces,
           (select count(*) from public.psgc_towns)::int        as towns,
           (select count(*) from public.psgc_town_aliases)::int as aliases`);
  check(
    counts.regions === 18 &&
      counts.provinces === 85 &&
      counts.towns === 1642 &&
      counts.aliases === 82,
    `the 2Q 2026 release: 18 regions, 85 provinces, 1,642 towns, 82 aliases (${JSON.stringify(counts)})`,
  );
  const sulu = await one<{ region: string }>(sql`
    select p.region_code as region
    from public.psgc_town_aliases a
    join public.psgc_towns t on t.code = a.code
    join public.psgc_provinces p on p.code = t.province_code
    where a.old_code = '1906601000'`);
  check(sulu?.region === "0900000000", "a 2023 Sulu town lands in Region IX, where Sulu is now");
  const rule = await one<Record<string, string | null>>(sql`
    select public.console_psgc_town('0702250001') as talisay,
           public.console_psgc_town('1380601001') as manila,
           public.console_psgc_town('1380699999') as manila_district,
           public.console_psgc_town('12345')      as short,
           public.console_psgc_town(null)         as missing`);
  check(
    rule.talisay === TALISAY &&
      rule.manila === "1380600000" &&
      rule.manila_district === "1380600000" &&
      rule.short === null &&
      rule.missing === null,
    `barangay → town rule (${JSON.stringify(rule)})`,
  );

  // ── Fixture ──
  const users = await one<Record<string, string>>(sql`
    select tests.create_user('s14@example.test', 'admin') as super_admin,
           tests.create_user('admin.a14@example.test')    as admin_a,
           tests.create_user('tech.a14@example.test')     as tech_a,
           tests.create_user('tech.b14@example.test')     as tech_b`);
  await sql`select tests.act_as(${users.super_admin}::uuid)`;
  const labs = await one<{ lab_a: string; lab_b: string }>(sql`
    select public.console_create_organization('Map Lab A') as lab_a,
           public.console_create_organization('Map Lab B') as lab_b`);
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
        values ('Map', ${barangay}, 'F', '2014-01-01', ${barangay}, ${tech}::uuid) returning id`)
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
      values (${sample.id}::uuid, 'Ascaris', 0.9,
              ${kind === "rejected" ? "FALSE_POSITIVE" : "CONFIRMED"})`;
  };
  const many = async (patientId: string, tech: string, kinds: Kind[], at?: string) => {
    for (const kind of kinds) await session(patientId, tech, kind, at);
  };

  const a = users.tech_a;
  const b = users.tech_b;
  // Lab A
  await many(await patient("0702250001", a), a, [
    "positive",
    "positive",
    "positive",
    "negative",
    "negative",
    "rejected",
    "unread",
    "deleted",
  ]); // Talisay: 6 examined, 3 positive
  await many(await patient("0702232001", a), a, ["positive", "negative"]); // Minglanilla: 2
  await many(await patient("1380601001", a), a, ["positive"]); // Manila: 1
  await many(await patient("0604502001", a), a, [
    "positive",
    "positive",
    "negative",
    "negative",
    "negative",
  ]); // a 2023 Negros Occidental code: City of Bago, NIR, 5 examined, 2 positive
  await many(await patient("1906601001", a), a, ["positive"]); // a 2023 Sulu code: 1
  await many(await patient("9999999001", a), a, ["positive"]); // matches no town
  // Lab B
  const bohol = await patient("0701201001", b);
  await many(bohol, b, ["positive", "positive", "positive"]); // Bohol: 3
  await session(bohol, b, "positive", "2026-10-02T02:00:00Z"); // October

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

  // ── Country, everything, September ──
  const country = await read(users.super_admin, "country", null);
  check(country.children.length === 18, "the country lists all 18 regions");
  check(
    same(country.figure, 18, 11),
    `the country: 18 placed, 11 positive (${JSON.stringify(country.figure)})`,
  );
  check(country.unplaced === 1, "one smear is not placed on the map");
  check(
    same(child(country, VII), 11, 7),
    "Region VII adds up its towns' smears, not its shown ones",
  );
  check(same(child(country, "1300000000"), null, null), "NCR with one smear is withheld");
  check(same(child(country, NIR), 5, 2), "a 2023 code counts under the Negros Island Region");
  check(same(child(country, "0900000000"), null, null), "a 2023 Sulu code counts under Region IX");
  check(same(child(country, "1400000000"), 0, 0), "a region with no smear is 0, not withheld");
  check(
    country.children.every((c) => c.name.length > 0),
    "every region carries its name",
  );

  // The dashboard agrees: placed plus not placed is its examined count.
  await sql`select tests.act_as(${users.super_admin}::uuid)`;
  const dashboard = await one<{ f: { smears_examined: number; positive_smears: number } }>(sql`
    select public.console_dashboard_figures(null, '2026-09-01', '2026-09-30') as f`);
  const totals = typeof dashboard.f === "string" ? JSON.parse(dashboard.f) : dashboard.f;
  check(
    totals.smears_examined === 18 + 1 && totals.positive_smears === 11 + 1,
    `the map and the dashboard count the same smears (${JSON.stringify(totals)})`,
  );

  // ── Region and province ──
  const region = await read(users.super_admin, "region", VII);
  check(region.name.length > 0 && region.parents.length === 0, "a region names itself, no parent");
  check(same(region.figure, 11, 7), "the region's own figure");
  check(same(child(region, CEBU), 8, 4), "Cebu's two small towns add up to a figure it may show");
  check(same(child(region, BOHOL), null, null), "Bohol with 3 smears is withheld");
  check(region.unplaced === null, "only the country reports smears not placed");

  const cebu = await read(users.super_admin, "province", CEBU);
  check(
    cebu.parents.length === 1 && cebu.parents[0].code === VII && cebu.parents[0].level === "region",
    "a province names its region",
  );
  check(
    same(child(cebu, TALISAY), 6, 3),
    "Talisay: unread, deleted-only and rejected smears handled",
  );
  check(same(child(cebu, MINGLANILLA), null, null), "Minglanilla with 2 smears is withheld");
  check(same(child(cebu, TOLEDO), 0, 0), "Toledo has none");

  const negros = await read(users.super_admin, "province", NEGROS_OCC);
  check(same(child(negros, BAGO), 5, 2), "the 2023 code reaches the City of Bago");

  // ── Period ──
  const always = await read(users.super_admin, "region", VII, null, null, null);
  check(same(always.figure, 12, 8), "without a period, October's smear counts");
  const october = await read(users.super_admin, "region", VII, null, "2026-10-01", "2026-10-31");
  check(same(october.figure, null, null), "October alone: Region VII has 1 smear and is withheld");

  // ── Scope ──
  const own = await read(users.admin_a, "region", VII);
  check(same(own.figure, 8, 4), "an org admin sees their laboratory only");
  check(same(child(own, BOHOL), 0, 0), "another laboratory's province is empty to them");
  const narrowed = await read(users.super_admin, "region", VII, labs.lab_b);
  check(same(narrowed.figure, null, null), "a super admin can narrow to one laboratory");

  const refused = async (caller: string, query: string, state: string, message: string) => {
    await sql`select tests.act_as(${caller}::uuid)`;
    await sql`select tests.expect_error(${query}, ${state}, ${message})`;
  };
  await refused(
    users.admin_a,
    `select public.console_area_prevalence('country', null, '${labs.lab_b}')`,
    "42501",
    "an org admin cannot ask for another laboratory",
  );
  await refused(
    users.tech_a,
    "select public.console_area_prevalence()",
    "42501",
    "a medtech is refused",
  );
  await refused(
    users.super_admin,
    "select public.console_area_prevalence('region', '0000000000')",
    "P0002",
    "an unknown region",
  );
  await refused(
    users.super_admin,
    "select public.console_area_prevalence('town', '0702250000')",
    "22023",
    "towns have nothing below them",
  );
  await refused(
    users.super_admin,
    `select public.console_area_prevalence('country', '${VII}')`,
    "22023",
    "the country takes no code",
  );

  // ── Privileges ──
  await sql`select tests.act_as_owner()`;
  const grants = await one<Record<string, boolean>>(sql`
    select has_table_privilege('authenticated', 'public.psgc_towns', 'select')           as towns,
           has_table_privilege('anon', 'public.psgc_regions', 'select')                  as regions,
           has_function_privilege('anon',
             'public.console_area_prevalence(text, text, uuid, date, date)', 'execute')   as anon_map,
           has_function_privilege('authenticated',
             'public.console_area_prevalence(text, text, uuid, date, date)', 'execute')   as map,
           has_function_privilege('authenticated',
             'public.console_area_figure(integer, integer)', 'execute')                   as figure`);
  check(
    !grants.towns && !grants.regions && !grants.anon_map && grants.map && !grants.figure,
    `only the map function is callable, by signed-in users (${JSON.stringify(grants)})`,
  );
}
