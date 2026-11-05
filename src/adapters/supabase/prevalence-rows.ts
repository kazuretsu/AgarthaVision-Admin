import { toAreaFigure, type AreaFigureRow, type MapLevel, type PrevalenceView } from "@/domain";

/** `console_area_prevalence()`'s jsonb, as admin/0014 and 0015 build it. */
export interface AreaPrevalenceRow {
  level: MapLevel;
  code: string | null;
  name: string;
  parents: { level: MapLevel; code: string; name: string }[];
  figure: AreaFigureRow;
  unplaced: number | null;
  /** A barangay has no name here: the database has no barangay table (admin/0015). */
  children: (AreaFigureRow & { code: string; name: string | null })[];
}

export function toPrevalenceView(row: AreaPrevalenceRow): PrevalenceView {
  return {
    level: row.level,
    code: row.code,
    name: row.name,
    trail:
      row.level === "country"
        ? []
        : [
            { level: "country", code: null, name: "Philippines" },
            ...row.parents.map((parent) => ({
              level: parent.level,
              code: parent.code,
              name: parent.name,
            })),
          ],
    figure: toAreaFigure(row.figure),
    unplaced: row.unplaced,
    areas: row.children.map((child) => ({
      code: child.code,
      name: child.name ?? child.code,
      figure: toAreaFigure(child),
    })),
  };
}
