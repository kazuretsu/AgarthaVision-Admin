import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The map's worker is served from `public/vendor/maplibre-gl/<version>/`, copied by
 * `scripts/vendor-maplibre.ts`. It must be the installed package's own files: a worker from
 * another version would talk to the main module in a protocol it does not share.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PKG = join(ROOT, "node_modules/maplibre-gl");
const { version } = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")) as {
  version: string;
};

describe("vendored MapLibre worker", () => {
  it.each(["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"])(
    "%s matches the installed maplibre-gl",
    (file) => {
      const vendored = readFileSync(join(ROOT, "public/vendor/maplibre-gl", version, file));
      expect(vendored.equals(readFileSync(join(PKG, "dist", file)))).toBe(true);
    },
  );

  it("is pinned to an exact version", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies["maplibre-gl"]).toBe(version);
  });
});
