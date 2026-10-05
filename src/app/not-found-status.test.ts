import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A route-level `loading.tsx` starts streaming the response with status 200 before the
 * page below it runs. A page under one that calls `notFound()` then shows the not-found
 * content with a 200, never a 404 (14zcqntjw73). These checks keep any page that can
 * answer 404 out from under a loading state; such a page shows its own progress inside
 * a Suspense boundary, below its not-found check.
 */

const APP = dirname(new URL(import.meta.url).pathname);
const LOADING = ["loading.tsx", "loading.ts", "loading.jsx", "loading.js"];

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return pages(path);
    return name === "page.tsx" ? [path] : [];
  });
}

/** Every loading file from the page's own folder up to `src/app`. */
function loadingAbove(page: string): string[] {
  const found: string[] = [];
  for (let dir = dirname(page); dir.startsWith(APP); dir = dirname(dir)) {
    for (const name of LOADING) {
      if (existsSync(join(dir, name))) found.push(relative(APP, join(dir, name)));
    }
    if (dir === APP) break;
  }
  return found;
}

const notFoundPages = pages(APP).filter((page) => readFileSync(page, "utf8").includes("notFound("));

describe("pages that answer 404", () => {
  it("include the record and organization detail pages", () => {
    const routes = notFoundPages.map((page) => relative(APP, page));
    for (const route of [
      "(dashboard)/records/patients/[patientId]/page.tsx",
      "(dashboard)/records/sessions/[sessionId]/page.tsx",
      "(dashboard)/records/samples/[sampleId]/page.tsx",
      "(dashboard)/organizations/[organizationId]/page.tsx",
    ]) {
      expect(routes).toContain(route);
    }
  });

  it.each(notFoundPages.map((page) => [relative(APP, page), page]))(
    "%s has no loading.tsx above it",
    (_route, page) => {
      expect(loadingAbove(page)).toEqual([]);
    },
  );

  it.each(notFoundPages.map((page) => [relative(APP, page), page]))(
    "%s decides not-found before it suspends anything",
    (_route, page) => {
      const source = readFileSync(page, "utf8");
      const suspense = source.indexOf("<Suspense");
      if (suspense === -1) return;
      expect(source.indexOf("notFound(")).toBeLessThan(suspense);
    },
  );
});
