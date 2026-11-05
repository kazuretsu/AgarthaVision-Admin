/** The PSGC and town-key CSVs, read the way both geo build scripts need them. */

export function csv(text: string): Record<string, string>[] {
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

/** The City of Manila's barangays sit under districts; every other one under its town. */
export const MANILA_PREFIX = "13806";
export const MANILA_TOWN = "1380600000";

/** The town a barangay falls in: the rule `console_psgc_town()` (admin/0014) applies. */
export const townOf = (barangay: string) =>
  barangay.startsWith(MANILA_PREFIX) ? MANILA_TOWN : `${barangay.slice(0, 7)}000`;
