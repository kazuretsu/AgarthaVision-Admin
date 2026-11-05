import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A route-level `loading.tsx` starts streaming the response with status 200 before the
 * page below it runs. A page under one that calls `notFound()` then shows the not-found
 * content with a 200, never a 404 (14zcqntjw73). These checks keep any page that can
 * answer 404 out from under a loading state; such a page shows its own progress inside
 * a Suspense boundary, below its not-found check.
 */

const APP = dirname(fileURLToPath(import.meta.url));
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

/**
 * A page answers 404 when it calls `notFound()` itself, or when it admits fewer kinds of
 * user than the whole console: `requirePageAccess([...])` with a literal list (an org admin
 * opening a super admin's page gets a 404), not `ANY_CONSOLE_USER`.
 */
const NARROW_ACCESS = "requirePageAccess([";
const answers404 = (source: string) =>
  source.includes("notFound(") || source.includes(NARROW_ACCESS);
/** Where the page first decides it is a 404, whichever comes first. */
const firstDecision = (source: string) =>
  Math.min(
    ...["notFound(", NARROW_ACCESS]
      .map((marker) => source.indexOf(marker))
      .filter((index) => index !== -1),
  );

const notFoundPages = pages(APP).filter((page) => answers404(readFileSync(page, "utf8")));
const otherDashboardPages = pages(join(APP, "(dashboard)")).filter(
  (page) => !answers404(readFileSync(page, "utf8")),
);

describe("pages that answer 404", () => {
  it("include the record and organization detail pages", () => {
    // Forward slashes on every OS, so the routes below read the same on Windows.
    const routes = notFoundPages.map((page) => relative(APP, page).split(sep).join("/"));
    for (const route of [
      "(dashboard)/records/patients/[patientId]/page.tsx",
      "(dashboard)/records/sessions/[sessionId]/page.tsx",
      "(dashboard)/records/samples/[sampleId]/page.tsx",
      "(dashboard)/organizations/[organizationId]/page.tsx",
      "(dashboard)/organizations/page.tsx",
      "(dashboard)/people/[userId]/page.tsx",
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
      expect(firstDecision(source)).toBeLessThan(suspense);
    },
  );
});

describe("pages that cannot answer 404", () => {
  // 14zcqntk6h5: a click shows a skeleton at once. A page with no 404 to protect gets a
  // route-level loading state, shaped like the page, in a route group when a page that
  // can 404 sits beneath it (as `records/(list)/` and `people/(list)/` do).
  it.each(otherDashboardPages.map((page) => [relative(APP, page), page]))(
    "%s has a loading.tsx above it",
    (_route, page) => {
      expect(loadingAbove(page).length).toBeGreaterThan(0);
    },
  );
});
