/**
 * Builds the barangay names the prevalence map's city view lists (14zcqntjnt6).
 *
 *   bun scripts/geo/build-barangay-names.ts
 *
 * Reads, from a checkout of the app repo (AGARTHAVISION_APP_DIR, default ../AgarthaVision):
 *   tools/psgc/psgc-barangays-q2_2026.csvgz   42,011 barangays: code, name and town
 *
 * Writes:
 *   src/lib/map/barangays/q2_2026/<prefix>.json   { town code: { barangay code: name } }, one
 *     file per PSGC province segment (a code's first five digits), so the server reads one
 *     small file for the city it shows and never the whole release.
 *
 * The database lists a city's barangays by code (`console_area_prevalence('town', …)`,
 * admin/0015) and has no barangay table by design; these files name them. They are the same
 * 2Q 2026 release as the map's lookup, and the script stops if the two stop agreeing: every
 * barangay's town must follow the rule the database applies, and every town must be one
 * admin/0014 holds, and the other way round. No network.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { csv, townOf } from "./psgc-csv";

const VINTAGE = "q2_2026";

const appDir = resolve(process.env.AGARTHAVISION_APP_DIR ?? "../AgarthaVision");
const root = resolve(import.meta.dir, "../..");
const outDir = join(root, "src/lib/map/barangays", VINTAGE);
const lookup = join(root, "supabase/migrations/admin/0014_prevalence_map.sql");

function fail(message: string): never {
  console.error(`build-barangay-names: ${message}`);
  process.exit(1);
}

const barangays = csv(
  gunzipSync(readFileSync(join(appDir, `tools/psgc/psgc-barangays-${VINTAGE}.csvgz`))).toString(
    "utf8",
  ),
);

// The towns admin/0014 holds, from its generated insert.
const townSection = readFileSync(lookup, "utf8").split(
  "insert into public.psgc_towns (code, name, province_code) values",
)[1];
if (!townSection) fail(`${lookup} has no psgc_towns rows`);
const lookupTowns = new Set(
  [...townSection.split(";")[0].matchAll(/\('(\d{10})'/g)].map((match) => match[1]),
);

const byPrefix = new Map<string, Map<string, Record<string, string>>>();
const seen = new Set<string>();
for (const b of barangays) {
  if (!/^\d{10}$/.test(b.code)) fail(`barangay code ${b.code} is not ten digits`);
  if (seen.has(b.code)) fail(`barangay ${b.code} is listed twice`);
  seen.add(b.code);
  if (!b.name) fail(`barangay ${b.code} has no name`);
  const town = townOf(b.code);
  if (town !== b.city_muni_code) fail(`barangay ${b.code} is in ${b.city_muni_code}, not ${town}`);
  if (!lookupTowns.has(town)) fail(`town ${town} is not in admin/0014`);
  const prefix = town.slice(0, 5);
  const towns = byPrefix.get(prefix) ?? new Map<string, Record<string, string>>();
  const names = towns.get(town) ?? {};
  names[b.code] = b.name;
  towns.set(town, names);
  byPrefix.set(prefix, towns);
}
const named = new Set([...byPrefix.values()].flatMap((towns) => [...towns.keys()]));
for (const town of lookupTowns) {
  if (!named.has(town)) fail(`admin/0014 town ${town} has no barangays in the release`);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
for (const [prefix, towns] of [...byPrefix].sort(([a], [b]) => a.localeCompare(b))) {
  const sorted = Object.fromEntries([...towns].sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(join(outDir, `${prefix}.json`), `${JSON.stringify(sorted)}\n`);
}

console.log(
  `barangays ${barangays.length} in ${named.size} towns, ${byPrefix.size} files; ` +
    `every town agrees with admin/0014`,
);
