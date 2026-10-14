import { toAreaFigure, type AreaFigureRow, type MapLevel, type PrevalenceView } from "@/domain";

/** `console_area_prevalence()`'s jsonb, as admin/0014 builds it. */
export interface AreaPrevalenceRow {
  level: MapLevel;
  code: string | null;
  name: string;
  parents: { level: MapLevel; code: string; name: string }[];
  figure: AreaFigureRow;
  unplaced: number | null;
  children: (AreaFigureRow & { code: string; name: string })[];
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
      name: child.name,
      figure: toAreaFigure(child),
    })),
  };
}
