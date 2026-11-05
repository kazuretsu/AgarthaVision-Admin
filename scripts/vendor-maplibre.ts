/**
 * Copies MapLibre's worker into `public/`, where the map loads it from.
 *
 *   bun scripts/vendor-maplibre.ts
 *
 * MapLibre 6 starts its worker from a URL beside its own module, which a bundled Next chunk is
 * not. The page bundles the main module as usual and points the worker at
 * `/vendor/maplibre-gl/<version>/maplibre-gl-worker.mjs` (`setWorkerUrl`), which imports its
 * neighbour `maplibre-gl-shared.mjs`. Run this after changing the maplibre-gl version;
 * `src/lib/map/vendor.test.ts` fails until the copies match the installed package.
 */
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const pkg = join(root, "node_modules/maplibre-gl");
const { version } = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8")) as {
  version: string;
};
const out = join(root, "public/vendor/maplibre-gl");

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, version), { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs", "LICENSE.txt"]) {
  copyFileSync(join(pkg, file === "LICENSE.txt" ? file : `dist/${file}`), join(out, version, file));
}
console.log(`vendored maplibre-gl ${version}`);
