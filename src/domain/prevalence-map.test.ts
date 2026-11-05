import { describe, expect, it } from "vitest";
import {
  bandOf,
  barangayBreakdown,
  boundariesFor,
  crumbsOf,
  describeFigure,
  drillTarget,
  mapHref,
  parseIsolate,
  parseMapLocation,
  shadeOf,
  toAreaFigure,
  unlistedBarangay,
  type AreaFigure,
  type AreaRow,
  type PrevalenceView,
} from "./prevalence-map";

const COUNTRY = { level: "country", code: null, name: "Philippines" } as const;
const VII = { level: "region", code: "0700000000", name: "Region VII" } as const;
const CEBU = { level: "province", code: "0702200000", name: "Cebu" } as const;

const viewOf = (over: Partial<PrevalenceView>): PrevalenceView => ({
  level: "country",
  code: null,
  name: "Philippines",
  trail: [],
  figure: { kind: "none" },
  unplaced: null,
  areas: [],
  ...over,
});

describe("toAreaFigure", () => {
  it("withholds a suppressed area, whatever else the row says", () => {
    expect(toAreaFigure({ examined: 4, positive: 1, suppressed: true })).toEqual({
      kind: "too_few",
    });
  });

  it("tells no data from too few", () => {
    expect(toAreaFigure({ examined: 0, positive: 0, suppressed: false })).toEqual({ kind: "none" });
  });

  it("takes the rate from the database's counts", () => {
    expect(toAreaFigure({ examined: 8, positive: 2, suppressed: false })).toEqual({
      kind: "reported",
      examined: 8,
      positive: 2,
      rate: 0.25,
    });
  });
});

describe("bandOf", () => {
  // The app's PositiveRateBin: each boundary belongs to the band above it.
  it.each([
    [0, 0],
    [0.01, 1],
    [0.0999, 1],
    [0.1, 2],
    [0.1999, 2],
    [0.2, 3],
    [0.3999, 3],
    [0.4, 4],
    [1, 4],
  ])("%f is band %i", (rate, band) => {
    expect(bandOf(rate)).toBe(band);
  });
});

describe("shadeOf and describeFigure", () => {
  it("never puts a number on a withheld area", () => {
    expect(shadeOf({ kind: "too_few" })).toBe("too_few");
    expect(describeFigure({ kind: "too_few" })).not.toMatch(/\d+ of|\d+(\.\d)?%/);
    expect(describeFigure({ kind: "too_few" })).toContain("Too few to report");
  });

  it("describes a reported area", () => {
    const figure = toAreaFigure({ examined: 12, positive: 3, suppressed: false });
    expect(shadeOf(figure)).toBe(3);
    expect(describeFigure(figure)).toBe("25.0% positive · 3 of 12 smears");
  });
});

describe("parseMapLocation", () => {
  it("is the country without a code", () => {
    expect(parseMapLocation({})).toEqual({ level: "country", code: null });
  });

  it("prefers the province", () => {
    expect(parseMapLocation({ region: "0700000000", province: "0702200000" })).toEqual({
      level: "province",
      code: "0702200000",
    });
  });

  it("prefers the town over the province", () => {
    expect(parseMapLocation({ province: "0702200000", town: "0702250000" })).toEqual({
      level: "town",
      code: "0702250000",
    });
  });

  it("drops anything but a 10-digit code", () => {
    expect(parseMapLocation({ region: "07" })).toEqual({ level: "country", code: null });
    expect(parseMapLocation({ province: "x' or 1=1", region: "0700000000" })).toEqual({
      level: "region",
      code: "0700000000",
    });
  });
});

describe("mapHref and drillTarget", () => {
  it("keeps the period and laboratory", () => {
    expect(
      mapHref({ level: "region", code: "0700000000" }, { from: "2026-09-01", org: "lab" }),
    ).toBe("/map?region=0700000000&from=2026-09-01&org=lab");
    expect(mapHref({ level: "country", code: null }, {})).toBe("/map");
  });

  it("opens a town, and keeps an isolated area", () => {
    expect(mapHref({ level: "town", code: "0702250000" }, { to: "2026-09-30" })).toBe(
      "/map?town=0702250000&to=2026-09-30",
    );
    expect(mapHref({ level: "region", code: "0700000000" }, { isolate: "0702200000" })).toBe(
      "/map?region=0700000000&isolate=0702200000",
    );
  });

  it("opens one level down, and nothing below a town", () => {
    expect(drillTarget("country", "0700000000")).toEqual({ level: "region", code: "0700000000" });
    expect(drillTarget("region", "0702200000")).toEqual({ level: "province", code: "0702200000" });
    expect(drillTarget("province", "0702250000")).toEqual({ level: "town", code: "0702250000" });
    expect(drillTarget("town", "0702250001")).toBeNull();
  });
});

describe("parseIsolate", () => {
  const areas = [{ code: "0702200000" }, { code: "0701200000" }];

  it("isolates one of the areas shown", () => {
    expect(parseIsolate({ isolate: "0702200000" }, areas)).toBe("0702200000");
  });

  it("ignores a code the map does not show, or none", () => {
    expect(parseIsolate({ isolate: "1300000000" }, areas)).toBeNull();
    expect(parseIsolate({ isolate: ["0702200000' or 1=1"] }, areas)).toBeNull();
    expect(parseIsolate({}, areas)).toBeNull();
  });
});

describe("boundariesFor", () => {
  it("draws regions, a region's provinces, or a province's towns", () => {
    expect(boundariesFor(viewOf({}))).toEqual({
      url: "/geo/q2_2026/regions.json",
      filter: null,
    });
    expect(boundariesFor(viewOf({ level: "region", code: VII.code, trail: [COUNTRY] }))).toEqual({
      url: "/geo/q2_2026/provinces.json",
      filter: { key: "region", value: "0700000000" },
    });
    expect(
      boundariesFor(viewOf({ level: "province", code: CEBU.code, trail: [COUNTRY, VII] })),
    ).toEqual({
      url: "/geo/q2_2026/towns/0702200000.json",
      filter: null,
    });
  });

  it("draws a town alone, from its province's file", () => {
    expect(
      boundariesFor(viewOf({ level: "town", code: "0702250000", trail: [COUNTRY, VII, CEBU] })),
    ).toEqual({
      url: "/geo/q2_2026/towns/0702200000.json",
      filter: { key: "code", value: "0702250000" },
    });
  });

  it("draws an isolated area alone, at every level", () => {
    const only = (code: string) => ({ key: "code", value: code });
    expect(boundariesFor(viewOf({}), "0700000000").filter).toEqual(only("0700000000"));
    expect(
      boundariesFor(viewOf({ level: "region", code: VII.code, trail: [COUNTRY] }), CEBU.code)
        .filter,
    ).toEqual(only(CEBU.code));
    expect(
      boundariesFor(
        viewOf({ level: "province", code: CEBU.code, trail: [COUNTRY, VII] }),
        "0702250000",
      ).filter,
    ).toEqual(only("0702250000"));
  });
});

describe("barangayBreakdown", () => {
  const reported = (examined: number, positive: number): AreaFigure => ({
    kind: "reported",
    examined,
    positive,
    rate: positive / examined,
  });
  const row = (code: string, figure: AreaFigure): AreaRow => ({ code, name: code, figure });
  const names = new Map([
    ["0702250001", "Bulacao"],
    ["0702250002", "Cansojong"],
    ["0702250003", "Dumlog"],
    ["0702250004", "Lagtang"],
    ["0702250005", "Poblacion"],
  ]);

  it("ranks the highest rate first, then more smears, and withheld barangays last", () => {
    const { rows } = barangayBreakdown(
      [
        row("0702250001", { kind: "too_few" }),
        row("0702250002", reported(10, 2)),
        row("0702250003", reported(5, 1)),
        row("0702250004", reported(6, 3)),
        row("0702250005", { kind: "too_few" }),
      ],
      names,
    );
    expect(rows.map((r) => r.name)).toEqual([
      "Lagtang",
      "Cansojong",
      "Dumlog",
      "Bulacao",
      "Poblacion",
    ]);
  });

  it("never puts a figure on a withheld barangay", () => {
    const { rows } = barangayBreakdown([row("0702250001", { kind: "too_few" })], names);
    expect(rows[0].figure).toEqual({ kind: "too_few" });
  });

  it("counts the town's barangays with no smear", () => {
    expect(barangayBreakdown([row("0702250002", reported(5, 0))], names).withoutSmears).toBe(4);
  });

  it("lists a code not in the release by its code, and counts it apart", () => {
    const { rows, withoutSmears } = barangayBreakdown([row("0702250999", reported(5, 1))], names);
    expect(rows[0].name).toBe(unlistedBarangay("0702250999"));
    expect(withoutSmears).toBe(5);
  });
});

describe("crumbsOf", () => {
  it("runs from the country to the area itself", () => {
    const view: PrevalenceView = {
      level: "province",
      code: "0702200000",
      name: "Cebu",
      trail: [
        { level: "country", code: null, name: "Philippines" },
        { level: "region", code: "0700000000", name: "Region VII (Central Visayas)" },
      ],
      figure: { kind: "none" },
      unplaced: null,
      areas: [],
    };
    expect(crumbsOf(view).map((crumb) => crumb.name)).toEqual([
      "Philippines",
      "Region VII (Central Visayas)",
      "Cebu",
    ]);
  });
});
