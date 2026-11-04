import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every citation in the docs resolves (14zcqnttfjh). A card cites code as `path:line`
 * (constraint #11) so a mismatch is cheap to find, and that only works while the path
 * exists and the line is inside the file. This test cannot tell whether the cited line
 * still says what the card claims; it catches the citation that points nowhere.
 *
 * Checked: `SESSION_INIT.md` and every `.md` under `docs/`, except `docs/CHANGELOG.md`,
 * which records what was true when each entry was written and is never rewritten.
 * - A backticked repo path, with or without `:line` or `:start-end`: the path exists and
 *   the lines are inside the file.
 * - A relative markdown link: the target exists.
 * Not checked: a bare file name (`database.ts:813`), a glob or placeholder, and a file the
 * docs cite from the AgarthaVision app repo, not this one: its migrations
 * (`supabase/migrations/NNNN_*.sql`, outside `admin/`) and the files named in `APP_REPO`.
 */
const ROOTS = ["src/", "supabase/", "scripts/", "public/", "docs/", ".husky/", ".github/"];
const CITATION = /^((?:[\w.()[\]@-]+\/)*[\w.()[\]@-]+\/?)(?::(\d+)(?:-(\d+))?)?$/;
const APP_REPO = [/^supabase\/migrations\/\d{4}_/, /^docs\/patient-pii-position\.md$/];
const LINK = /\]\(([^)\s#]+)(?:#[^)]*)?\)/g;

function markdownFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name).replaceAll("\\", "/");
    return statSync(path).isDirectory() ? markdownFiles(path) : path.endsWith(".md") ? [path] : [];
  });
}

const docs = ["SESSION_INIT.md", ...markdownFiles("docs")].filter(
  (path) => path !== "docs/CHANGELOG.md",
);

const lineCounts = new Map<string, number>();
function lineCount(path: string): number {
  if (!lineCounts.has(path)) lineCounts.set(path, readFileSync(path, "utf8").split("\n").length);
  return lineCounts.get(path)!;
}

/** Why a backticked citation does not resolve, or null when it does or is not one. */
function brokenCitation(text: string): string | null {
  const match = CITATION.exec(text);
  if (!match) return null;
  const [, path, start, end] = match;
  if (!ROOTS.some((root) => path.startsWith(root))) return null;
  if (APP_REPO.some((pattern) => pattern.test(path))) return null;
  if (!existsSync(path)) return "no such file";
  if (!start) return null;
  if (statSync(path).isDirectory()) return "a line cited in a directory";
  const last = Number(end ?? start);
  const lines = lineCount(path);
  return last > lines ? `line ${last} is past the end (${lines} lines)` : null;
}

describe("doc citations resolve", () => {
  it("finds the docs to check", () => {
    expect(docs).toContain("docs/map/effects/CONTEXT.md");
    expect(docs.length).toBeGreaterThan(20);
  });

  it("every backticked path:line names a file that exists and a line inside it", () => {
    const broken = docs.flatMap((doc) =>
      readFileSync(doc, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          [...line.matchAll(/`([^`\n]+)`/g)].flatMap(([, text]) => {
            const why = brokenCitation(text);
            return why ? [`${doc}:${index + 1} \`${text}\`: ${why}`] : [];
          }),
        ),
    );
    expect(broken).toEqual([]);
  });

  it("every relative link names a file that exists", () => {
    const broken = docs.flatMap((doc) =>
      readFileSync(doc, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          [...line.matchAll(LINK)]
            .map(([, target]) => target)
            .filter((target) => !/^[a-z]+:/.test(target))
            .filter((target) => !existsSync(join(dirname(doc), target)))
            .map((target) => `${doc}:${index + 1} (${target})`),
        ),
    );
    expect(broken).toEqual([]);
  });

  it("flags a missing file, a line past the end, and leaves the rest alone", () => {
    expect(brokenCitation("src/no-such-file.ts")).toBe("no such file");
    expect(brokenCitation("src/lib/utils.ts:99999")).toMatch(/past the end/);
    expect(brokenCitation("src/lib/utils.ts:1-99999")).toMatch(/past the end/);
    expect(brokenCitation("src/lib/:3")).toBe("a line cited in a directory");
    expect(brokenCitation("src/lib/utils.ts:1")).toBeNull();
    expect(brokenCitation("supabase/migrations/0001_init.sql:534")).toBeNull();
    expect(brokenCitation("docs/patient-pii-position.md")).toBeNull();
    expect(brokenCitation("supabase/migrations/admin/0099_none.sql")).toBe("no such file");
    expect(brokenCitation("database.ts:813")).toBeNull();
    expect(brokenCitation("bun run test")).toBeNull();
  });
});
