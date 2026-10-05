import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Constraint #15: components come from shadcn. Primitives live in `src/components/ui/`, are
 * added with `bunx shadcn@latest add <name>` from the Base UI registry (`components.json`),
 * and are never written from scratch. Everything else composes them. Card:
 * `docs/map/objects/ui-components.md`.
 */

const UI = dirname(fileURLToPath(import.meta.url));
const SRC = join(UI, "..", "..");
const ROOT = join(SRC, "..");

/**
 * The shadcn registry's `registry:ui` items (`apps/v4/public/r/index.json`, 2026-10-05). A file in
 * `ui/` must be one of these. If the registry gains an item you need, add its name here in the
 * same change that adds the component with the CLI.
 */
const SHADCN_UI_ITEMS = new Set(
  (
    "accordion alert alert-dialog aspect-ratio attachment avatar badge breadcrumb bubble button " +
    "button-group calendar card carousel chart checkbox collapsible combobox command context-menu " +
    "dialog direction drawer dropdown-menu empty field form hover-card input input-group input-otp " +
    "item kbd label marker menubar message message-scroller native-select navigation-menu " +
    "pagination popover progress questionnaire radio-group resizable scroll-area select separator " +
    "sheet sidebar skeleton slider sonner spinner switch table tabs textarea toast toggle " +
    "toggle-group tooltip"
  ).split(" "),
);

function files(dir: string, keep: (path: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, keep);
    return keep(path) ? [path] : [];
  });
}

const isSource = (path: string) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path);
const outsideUi = files(SRC, (path) => isSource(path) && !path.startsWith(UI));
const rel = (path: string) => relative(ROOT, path);

/** Elements that have a shadcn component and must not be hand-built outside `ui/`. */
const RAW_ELEMENT = /<(button|select|textarea|table|input)\b(?![^>]*type="hidden")/g;

function rawElements(): string[] {
  return outsideUi.flatMap((path) => {
    const found = new Set(
      [...readFileSync(path, "utf8").matchAll(RAW_ELEMENT)].map((match) => `<${match[1]}>`),
    );
    return [...found].map((element) => `${rel(path)} ${element}`);
  });
}

describe("components come from shadcn (constraint #15)", () => {
  it("components.json points the CLI at Base UI and this repo's paths", () => {
    const config = JSON.parse(readFileSync(join(ROOT, "components.json"), "utf8"));
    expect(config.style).toMatch(/^base-/);
    expect(config.tailwind.css).toBe("src/app/globals.css");
    expect(config.tailwind.cssVariables).toBe(true);
    expect(config.aliases).toMatchObject({ ui: "@/components/ui", utils: "@/lib/utils" });
  });

  it("every file in ui/ is a shadcn registry item", () => {
    const names = files(UI, isSource).map((path) => relative(UI, path).replace(/\.tsx?$/, ""));
    expect(names.filter((name) => !SHADCN_UI_ITEMS.has(name))).toEqual([]);
  });

  it("only ui/ builds on Base UI directly", () => {
    const importers = outsideUi.filter((path) => readFileSync(path, "utf8").includes("@base-ui/"));
    expect(importers.map(rel)).toEqual([]);
  });

  it("nothing outside ui/ hand-builds a button, select, textarea, table or input", () => {
    expect(rawElements()).toEqual([]);
  });

  it("globals.css keeps the console palette under shadcn's token names", () => {
    const css = readFileSync(join(SRC, "app", "globals.css"), "utf8");
    // `shadcn init` writes the registry's oklch() theme over :root; the console's colours are hex.
    expect(css).not.toMatch(/oklch\(/);
    expect(css).toContain("--primary: var(--av-maroon);");
    expect(css).toContain("--color-primary: var(--primary);");
  });
});
