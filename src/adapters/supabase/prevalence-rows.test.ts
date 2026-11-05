import { describe, expect, it } from "vitest";
import { toPrevalenceView, type AreaPrevalenceRow } from "./prevalence-rows";

const row = (over: Partial<AreaPrevalenceRow>): AreaPrevalenceRow => ({
  level: "country",
  code: null,
  name: "Philippines",
  parents: [],
  figure: { examined: 18, positive: 11, suppressed: false },
  unplaced: 1,
  children: [
    { code: "0700000000", name: "Region VII", examined: 11, positive: 7, suppressed: false },
    { code: "1300000000", name: "NCR", examined: null, positive: null, suppressed: true },
    { code: "1400000000", name: "CAR", examined: 0, positive: 0, suppressed: false },
  ],
  ...over,
});

describe("toPrevalenceView", () => {
  it("maps each child's figure and keeps the database's order", () => {
    const view = toPrevalenceView(row({}));
    expect(view.areas.map((area) => [area.code, area.figure.kind])).toEqual([
      ["0700000000", "reported"],
      ["1300000000", "too_few"],
      ["1400000000", "none"],
    ]);
    expect(view.unplaced).toBe(1);
    expect(view.trail).toEqual([]);
  });

  it("puts the country above a region, and the region above a province", () => {
    expect(toPrevalenceView(row({ level: "region", code: "0700000000" })).trail).toEqual([
      { level: "country", code: null, name: "Philippines" },
    ]);
    const province = toPrevalenceView(
      row({
        level: "province",
        code: "0702200000",
        name: "Cebu",
        parents: [{ level: "region", code: "0700000000", name: "Region VII" }],
      }),
    );
    expect(province.trail.map((crumb) => crumb.code)).toEqual([null, "0700000000"]);
  });

  it("puts a town under its province, and lists its barangays by code", () => {
    const town = toPrevalenceView(
      row({
        level: "town",
        code: "0702250000",
        name: "City of Talisay",
        parents: [
          { level: "region", code: "0700000000", name: "Region VII" },
          { level: "province", code: "0702200000", name: "Cebu" },
        ],
        unplaced: null,
        children: [
          { code: "0702250001", name: null, examined: 6, positive: 3, suppressed: false },
          { code: "0702250002", name: null, examined: null, positive: null, suppressed: true },
        ],
      }),
    );
    expect(town.trail.map((crumb) => crumb.level)).toEqual(["country", "region", "province"]);
    expect(town.areas.map((area) => [area.code, area.name, area.figure.kind])).toEqual([
      ["0702250001", "0702250001", "reported"],
      ["0702250002", "0702250002", "too_few"],
    ]);
  });
});
