// admin/0016 · A laboratory's name is cleaned before it is checked and stored: a look-alike
// that differs only by invisible characters is refused, a stored name holds none, and the
// database cleans a name exactly as the console does.
import type { ReservedSQL } from "bun";
import { cleanName } from "../../src/domain";

/** Names that must all read as "Cebu Lab". */
const LOOK_ALIKES: [string, string][] = [
  ["a zero-width space", "Cebu​ Lab"],
  ["a zero-width joiner", "Cebu‍ Lab"],
  ["a byte-order mark", "﻿Cebu Lab"],
  ["a soft hyphen", "Ce­bu Lab"],
  ["a right-to-left override", "‮Cebu Lab"],
  ["a word joiner", "Cebu⁠ Lab"],
  ["a variation selector", "Cebu️ Lab"],
  ["a tag character", "Cebu Lab\u{E0041}"],
  ["a Hangul filler", "Cebu ㅤLab"],
  ["a control character", "Cebu\u0007 Lab"],
  ["a no-break space", "Cebu Lab"],
  ["an ideographic space", "Cebu　Lab"],
  ["a line separator", "Cebu Lab"],
  ["a tab and a line break", " Cebu\t\n Lab "],
  ["full-width letters", "Ｃｅｂｕ Lab"],
  ["another case", "CEBU LAB"],
];

/** Further inputs the console and the database must clean alike. */
const OTHERS = [
  "Café Lab",
  "Laboratoryo ng Dumaguete — 第一",
  "  Iloilo   Mission   Hospital  ",
  "​​﻿",
  "Lab    B",
  "\u{1D400}\u{1D401} Lab",
  "Lab\u0085B",
  "ﬁeld Lab",
  "Lab ①",
  "Ｌａｂ　Ｃ",
  "Lab᠎ C",
  "Lab\u{1D173} C",
  "Lab\u{E0100} C",
  "",
];

export default async function test(sql: ReservedSQL) {
  const one = async <T>(query: Promise<unknown>) => ((await query) as T[])[0] as T;
  const check = (condition: boolean, message: string) => {
    if (!condition) throw new Error(`FAILED: ${message}`);
  };
  const refused = async (query: string, state: string, message: string) => {
    await sql`select tests.expect_error(${query}, ${state}, ${message})`;
  };
  const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

  // ── The database cleans as the console does ──
  for (const input of [...LOOK_ALIKES.map(([, name]) => name), ...OTHERS]) {
    const { cleaned } = await one<{ cleaned: string }>(
      sql`select public.console_clean_name(${input}) as cleaned`,
    );
    check(
      cleaned === cleanName(input),
      `console_clean_name and cleanName agree on ${JSON.stringify(input)}: ` +
        `${JSON.stringify(cleaned)} vs ${JSON.stringify(cleanName(input))}`,
    );
  }
  const { nothing } = await one<{ nothing: string }>(
    sql`select public.console_clean_name(null) as nothing`,
  );
  check(nothing === "", "a null name cleans to an empty one");

  const fn = await one<{ volatility: string; definer: boolean }>(sql`
    select provolatile as volatility, prosecdef as definer
    from pg_proc where oid = 'public.console_clean_name(text)'::regprocedure`);
  check(fn.volatility === "i" && !fn.definer, "console_clean_name is immutable, not a definer");

  // ── Look-alikes are refused ──
  const admin = await one<{ id: string }>(
    sql`select tests.create_user('s16@example.test', 'admin') as id`,
  );
  await sql`select tests.act_as(${admin.id}::uuid)`;
  const cebu = await one<{ id: string }>(
    sql`select public.console_create_organization('Cebu Lab') as id`,
  );
  for (const [what, name] of LOOK_ALIKES) {
    await refused(
      `select public.console_create_organization(${literal(name)})`,
      "23505",
      `a new laboratory named "Cebu Lab" with ${what} is refused as a duplicate`,
    );
  }
  const iloilo = await one<{ id: string }>(
    sql`select public.console_create_organization('Iloilo Lab') as id`,
  );
  for (const [what, name] of LOOK_ALIKES) {
    await refused(
      `select public.console_rename_organization('${iloilo.id}', ${literal(name)})`,
      "23505",
      `renaming to "Cebu Lab" with ${what} is refused as a duplicate`,
    );
  }

  // ── What is stored is clean ──
  const bacolod = await one<{ id: string }>(
    sql`select public.console_create_organization(${"﻿Bacolod​  Lab‍"}) as id`,
  );
  const stored = await one<{ name: string }>(
    sql`select name from public.organizations where id = ${bacolod.id}::uuid`,
  );
  check(
    stored.name === "Bacolod Lab",
    `a created name is stored clean (${JSON.stringify(stored.name)})`,
  );

  await sql`select public.console_rename_organization(${iloilo.id}::uuid, ${"Iloilo⁠ City　Lab"})`;
  const renamed = await one<{ name: string }>(
    sql`select name from public.organizations where id = ${iloilo.id}::uuid`,
  );
  check(renamed.name === "Iloilo City Lab", "a renamed name is stored clean");
  const audit = await one<{ to: string }>(sql`
    select details ->> 'to' as to from public.admin_audit_log
    where action = 'organization.rename' and organization_id = ${iloilo.id}::uuid
    order by id desc limit 1`);
  check(audit.to === "Iloilo City Lab", "the audit trail records the clean name");

  // Renaming to the same name with only invisible characters added changes nothing.
  const before = await one<{ n: number }>(sql`
    select count(*)::int as n from public.admin_audit_log where organization_id = ${cebu.id}::uuid`);
  await sql`select public.console_rename_organization(${cebu.id}::uuid, ${"Cebu​ Lab"})`;
  const after = await one<{ n: number }>(sql`
    select count(*)::int as n from public.admin_audit_log where organization_id = ${cebu.id}::uuid`);
  check(after.n === before.n, "a rename that cleans to the same name is no rename");

  await refused(
    `select public.console_create_organization(${literal("​​﻿")})`,
    "23514",
    "a name of invisible characters only is too short",
  );

  // ── No other write path can store an invisible character ──
  await sql`select tests.act_as_owner()`;
  await refused(
    `update public.organizations set name = ${literal("Cebu​ Lab 2")} where id = '${cebu.id}'`,
    "23514",
    "organizations_name_clean refuses a direct write of an uncleaned name",
  );
  await refused(
    `insert into public.organizations (name) values (${literal("Davao Lab")})`,
    "23514",
    "organizations_name_clean refuses a direct insert of an uncleaned name",
  );
  const { clean } = await one<{ clean: boolean }>(sql`
    select bool_and(name = public.console_clean_name(name)) as clean from public.organizations`);
  check(clean, "every stored name is its own cleaned form");

  // A status change still works with the constraint in place.
  await sql`select tests.act_as(${admin.id}::uuid)`;
  await sql`select public.console_set_organization_status(${iloilo.id}::uuid, 'deactivated')`;
  await sql`select public.console_set_organization_status(${iloilo.id}::uuid, 'active')`;
}
