import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * No tracked text file carries a character a reader cannot see (14zcqntjw7v). A raw
 * zero-width, bidirectional or line-separator character reads differently than it runs
 * (GitHub warns of "hidden or bidirectional Unicode text"), and the Supabase SQL editor
 * flags or rewrites some of them when a migration is pasted. Write one as an escape
 * instead: `\u200B` in TypeScript and in a Postgres regular expression.
 *
 * Hidden: format characters (Cf), line and paragraph separators, any space but the plain
 * one, and control characters other than tab and line breaks. Vendored third-party files
 * under `public/vendor/` are not ours to edit, and are skipped.
 */
const HIDDEN = /[\p{Cf}\p{Zl}\p{Zp}]|[^\P{Zs} ]|[^\P{Cc}\t\n\r]/gu;
const TEXT = /\.(ts|tsx|js|mjs|cjs|sql|md|json|css|ya?ml|txt|sh|html)$/;

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter((path) => TEXT.test(path) && !path.startsWith("public/vendor/"));

describe("no hidden characters in the source", () => {
  it("finds the files to check", () => {
    expect(tracked.length).toBeGreaterThan(100);
  });

  it("no tracked text file has one", () => {
    const found = tracked.flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          [...line.matchAll(HIDDEN)].map(
            ([character]) =>
              `${path}:${index + 1} U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`,
          ),
        ),
    );
    expect(found).toEqual([]);
  });
});
