/**
 * Builds the prevalence map's boundaries and area lookup from the app repo's committed
 * 2Q 2026 boundary build (14zcqntjnt3).
 *
 *   bun scripts/geo/build-map-data.ts
 *
 * Reads, from a checkout of the app repo (AGARTHAVISION_APP_DIR, default ../AgarthaVision):
 *   tools/geo/build/provinces-q2_2026.geojson.gz   85 province-level outlines
 *   tools/geo/build/towns-q2_2026.geojson.gz       1,642 city and municipality outlines
 *   tools/geo/town-keys-q2_2026.csv                each town's province, region and 2023 code
 *   tools/psgc/psgc-barangays-q2_2026.csvgz        region names, and the barangay → town rule
 * See the app's tools/geo/README.md for how those were made and their licence
 * (OCHA COD-AB, CC BY-IGO 3.0, attribution required wherever they are shown).
 *
 * Writes:
 *   public/geo/q2_2026/regions.json              18 regions, dissolved from the provinces
 *   public/geo/q2_2026/provinces.json            85 provinces, each with its region
 *   public/geo/q2_2026/towns/<province>.json     a province's towns, loaded on drill-down
 *   supabase/migrations/admin/0014_prevalence_map.sql, between its GENERATED markers: the
 *     rows of the area lookup the database groups by.
 *
 * Codes are 10-digit strings everywhere: the app's GeoJSON stores them as numbers, which drops
 * the leading zero of every code below region 10. Coordinates are rounded to what the level is
 * seen at: 3 decimals (about 110 m) for regions and provinces, shown a country or a region at a
 * time, and 4 (about 11 m) for towns, shown a province at a time. Regions are simplified once
 * more after the dissolve; a whole country on one screen needs far fewer points.
 *
 * Needs the network once, for `npx mapshaper` (pinned, the version the app's build uses),
 * which dissolves provinces into regions. Fails loudly if a fact the database relies on stops
 * holding: the barangay → town rule, the 2023 aliases, or a code the outlines and the lookup
 * do not share.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const VINTAGE = "q2_2026";
const MAPSHAPER = "mapshaper@0.6.121";
const MANILA_PREFIX = "13806";
const MANILA_TOWN = "1380600000";

const appDir = resolve(process.env.AGARTHAVISION_APP_DIR ?? "../AgarthaVision");
const root = resolve(import.meta.dir, "../..");
const outDir = join(root, "public/geo", VINTAGE);
const migration = join(root, "supabase/migrations/admin/0014_prevalence_map.sql");

type Geometry = { type: string; coordinates: unknown };
type Feature = { type: "Feature"; properties: Record<string, unknown>; geometry: Geometry };
type Collection = { type: "FeatureCollection"; features: Feature[] };

function fail(message: string): never {
  console.error(`build-map-data: ${message}`);
  process.exit(1);
}

const code = (value: unknown) => String(value).padStart(10, "0");

function readGz(path: string): string {
  return gunzipSync(readFileSync(join(appDir, path))).toString("utf8");
}

function csv(text: string): Record<string, string>[] {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const columns = head.split(",");
  return lines.map((line) => {
    // The PSGC files quote a field only when it holds a comma.
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (const char of line) {
      if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) {
        cells.push(cell);
        cell = "";
      } else cell += char;
    }
    cells.push(cell);
    return Object.fromEntries(columns.map((column, i) => [column, cells[i] ?? ""]));
  });
}

function round(coordinates: unknown, scale: number): unknown {
  if (typeof coordinates === "number") return Math.round(coordinates * scale) / scale;
  return (coordinates as unknown[]).map((c) => round(c, scale));
}

function collection(features: Feature[]): string {
  return JSON.stringify({ type: "FeatureCollection", features } satisfies Collection);
}

function shaped(feature: Feature, properties: Record<string, string>, scale: number): Feature {
  return {
    type: "Feature",
    properties,
    geometry: {
      type: feature.geometry.type,
      coordinates: round(feature.geometry.coordinates, scale),
    },
  };
}

const COARSE = 1e3;
const FINE = 1e4;

const sql = (text: string) => `'${text.replaceAll("'", "''")}'`;

// ── Read ─────────────────────────────────────────────────────────────────────
const provincesIn = JSON.parse(
  readGz(`tools/geo/build/provinces-${VINTAGE}.geojson.gz`),
) as Collection;
const townsIn = JSON.parse(readGz(`tools/geo/build/towns-${VINTAGE}.geojson.gz`)) as Collection;
const townKeys = csv(readFileSync(join(appDir, `tools/geo/town-keys-${VINTAGE}.csv`), "utf8"));
const barangays = csv(readGz(`tools/psgc/psgc-barangays-${VINTAGE}.csvgz`));

// ── The lookup ───────────────────────────────────────────────────────────────
const regionNames = new Map<string, string>();
for (const b of barangays) regionNames.set(b.region_code, b.region_name);

const towns = townKeys.map((t) => ({
  code: t.code,
  name: t.name,
  province: t.province_key,
  provinceName: t.province_name,
  region: t.region_code,
  oldCode: code(t.src_code),
}));
const townCodes = new Set(towns.map((t) => t.code));
const provinces = new Map<string, { name: string; region: string }>();
for (const t of towns) provinces.set(t.province, { name: t.provinceName, region: t.region });

// The database finds a barangay's town by this rule, not a 42,000-row table. Hold it to every
// barangay in the release.
const townOf = (barangay: string) =>
  barangay.startsWith(MANILA_PREFIX) ? MANILA_TOWN : `${barangay.slice(0, 7)}000`;
for (const b of barangays) {
  if (townOf(b.code) !== b.city_muni_code) {
    fail(`barangay ${b.code} is in town ${b.city_muni_code}, not ${townOf(b.code)}`);
  }
  if (!townCodes.has(b.city_muni_code)) fail(`town ${b.city_muni_code} has no lookup row`);
}
for (const region of new Set(towns.map((t) => t.region))) {
  if (!regionNames.has(region)) fail(`region ${region} has no name`);
}

// A patient recorded before the Negros Island Region and Sulu renumbering carries the 2023
// code. It must never collide with a current one.
const aliases = towns.filter((t) => t.oldCode !== t.code);
for (const a of aliases) {
  if (townCodes.has(a.oldCode)) fail(`2023 code ${a.oldCode} is also a current town`);
}

// ── Outlines ─────────────────────────────────────────────────────────────────
const provinceFeatures = provincesIn.features.map((f) => {
  const province = code(f.properties.province_key);
  const known = provinces.get(province);
  if (!known) fail(`outline for unknown province ${province}`);
  if (known.region !== code(f.properties.region_code)) fail(`province ${province} region differs`);
  return shaped(f, { code: province, name: known.name, region: known.region }, COARSE);
});
if (provinceFeatures.length !== provinces.size) {
  fail(`${provinceFeatures.length} province outlines for ${provinces.size} provinces`);
}

const townFeatures = townsIn.features.map((f) => {
  const town = code(f.properties.code);
  const known = towns.find((t) => t.code === town);
  if (!known) fail(`outline for unknown town ${town}`);
  return shaped(f, { code: town, name: known.name, province: known.province }, FINE);
});
if (townFeatures.length !== towns.length) {
  fail(`${townFeatures.length} town outlines for ${towns.length} towns`);
}

const work = mkdtempSync(join(tmpdir(), "map-data-"));
writeFileSync(join(work, "provinces.json"), collection(provinceFeatures));
execFileSync(
  "npx",
  [
    "-y",
    MAPSHAPER,
    "-i",
    join(work, "provinces.json"),
    "-dissolve",
    "region",
    "-filter-islands",
    "min-area=0.5km2",
    "-simplify",
    "percentage=30%",
    "keep-shapes",
    "-o",
    join(work, "regions.json"),
    "format=geojson",
  ],
  { stdio: "inherit" },
);
const regionFeatures = (
  JSON.parse(readFileSync(join(work, "regions.json"), "utf8")) as Collection
).features.map((f) => {
  const region = String(f.properties.region);
  return shaped(
    f,
    { code: region, name: regionNames.get(region) ?? fail(`region ${region}`) },
    COARSE,
  );
});
rmSync(work, { recursive: true });

// ── Write ────────────────────────────────────────────────────────────────────
rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, "towns"), { recursive: true });
writeFileSync(join(outDir, "regions.json"), collection(regionFeatures));
writeFileSync(join(outDir, "provinces.json"), collection(provinceFeatures));
for (const province of provinces.keys()) {
  writeFileSync(
    join(outDir, "towns", `${province}.json`),
    collection(townFeatures.filter((f) => f.properties.province === province)),
  );
}

const rows = (values: string[]) => values.join(",\n");
const generated = [
  "insert into public.psgc_regions (code, name) values",
  rows(
    [...new Set(towns.map((t) => t.region))]
      .sort()
      .map((r) => `    (${sql(r)}, ${sql(regionNames.get(r)!)})`),
  ) + ";",
  "",
  "insert into public.psgc_provinces (code, name, region_code) values",
  rows(
    [...provinces.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([p, v]) => `    (${sql(p)}, ${sql(v.name)}, ${sql(v.region)})`),
  ) + ";",
  "",
  "insert into public.psgc_towns (code, name, province_code) values",
  rows(
    [...towns]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((t) => `    (${sql(t.code)}, ${sql(t.name)}, ${sql(t.province)})`),
  ) + ";",
  "",
  "insert into public.psgc_town_aliases (old_code, code) values",
  rows(
    [...aliases]
      .sort((a, b) => a.oldCode.localeCompare(b.oldCode))
      .map((t) => `    (${sql(t.oldCode)}, ${sql(t.code)})`),
  ) + ";",
].join("\n");

const BEGIN = "-- BEGIN GENERATED by scripts/geo/build-map-data.ts; do not edit by hand.";
const END = "-- END GENERATED";
const current = readFileSync(migration, "utf8");
const start = current.indexOf(BEGIN);
const end = current.indexOf(END);
if (start < 0 || end < start) fail(`${migration} has no GENERATED markers`);
writeFileSync(migration, `${current.slice(0, start)}${BEGIN}\n${generated}\n${current.slice(end)}`);

console.log(
  `regions ${regionFeatures.length}, provinces ${provinceFeatures.length}, towns ${townFeatures.length}, ` +
    `aliases ${aliases.length}; barangay rule holds for ${barangays.length}`,
);
