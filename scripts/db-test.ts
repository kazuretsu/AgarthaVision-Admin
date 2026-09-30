/**
 * Applies every migration to a throwaway local database and runs the SQL tests.
 *
 *   bun run test:db
 *
 * Order: Supabase stubs → the app's migrations (0001…, from the app repo) → a small
 * pre-existing seed → this repo's admin migrations → test helpers → each
 * `supabase/tests/*.test.sql`, inside a transaction that is always rolled back.
 *
 * Refuses any host but localhost and any database not ending in `_test`: this script
 * drops and recreates its database, and must never be pointed at a real project.
 *
 * Environment:
 *   ADMIN_TEST_DATABASE_URL  default postgres://postgres@localhost:5432/agarthavision_admin_test
 *   AGARTHAVISION_APP_DIR    default ../AgarthaVision (a checkout of the app repo)
 */
import { SQL } from "bun";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const url = new URL(
  process.env.ADMIN_TEST_DATABASE_URL ??
    "postgres://postgres@localhost:5432/agarthavision_admin_test",
);
const appDir = resolve(process.env.AGARTHAVISION_APP_DIR ?? "../AgarthaVision");
const database = url.pathname.slice(1);

if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
  throw new Error(`Refusing to run against ${url.hostname}: local databases only.`);
}
if (!database.endsWith("_test")) {
  throw new Error(`Refusing to recreate "${database}": the database name must end in _test.`);
}

const root = resolve(import.meta.dir, "..");
const read = (path: string) => readFileSync(path, "utf8");
const migrations = (dir: string) =>
  readdirSync(dir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()
    .map((name) => join(dir, name));

const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = new SQL(adminUrl.toString());
await admin.unsafe(`drop database if exists "${database}" with (force)`);
await admin.unsafe(`create database "${database}"`);
await admin.close();

const sql = new SQL(url.toString(), { max: 1 });

async function apply(label: string, path: string) {
  try {
    await sql.unsafe(read(path));
  } catch (cause) {
    console.error(`✗ ${label}: ${path}`);
    throw cause;
  }
  console.log(`· ${label}: ${path.replace(`${root}/`, "").replace(`${appDir}/`, "app:")}`);
}

const appMigrations = migrations(join(appDir, "supabase/migrations"));
if (appMigrations.length === 0) {
  throw new Error(`No app migrations under ${appDir}. Set AGARTHAVISION_APP_DIR.`);
}

await apply("stubs", join(root, "supabase/tests/_supabase_stubs.sql"));
for (const path of appMigrations) await apply("app", path);
await apply("seed", join(root, "supabase/tests/_seed_before_admin.sql"));
for (const path of migrations(join(root, "supabase/migrations/admin"))) await apply("admin", path);
await apply("helpers", join(root, "supabase/tests/_helpers.sql"));

const tests = readdirSync(join(root, "supabase/tests"))
  .filter((name) => name.endsWith(".test.sql"))
  .sort();

let failed = 0;
for (const name of tests) {
  const connection = await sql.reserve();
  try {
    await connection.unsafe("begin");
    await connection.unsafe(read(join(root, "supabase/tests", name)));
    console.log(`✓ ${name}`);
  } catch (cause) {
    failed += 1;
    console.error(`✗ ${name}\n  ${(cause as Error).message}`);
  } finally {
    await connection.unsafe("rollback").catch(() => undefined);
    connection.release();
  }
}

await sql.close();
console.log(`\n${tests.length - failed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
