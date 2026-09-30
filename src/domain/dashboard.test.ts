import { describe, expect, it } from "vitest";
import type { SessionSummary } from "./clinical";
import { summariseDashboard, weekStart, type SmearRecord } from "./dashboard";

function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return { fieldCount: 5, eggCounts: [], totalEggs: 0, lpf: {}, isPositive: false, ...overrides };
}

let next = 0;
function smear(overrides: Partial<SmearRecord> = {}): SmearRecord {
  next += 1;
  return {
    sessionId: `session-${next}`,
    patientId: `patient-${next}`,
    startedAt: "2026-09-02T02:00:00Z",
    barangayCode: "0722217001",
    summary: summary(),
    ...overrides,
  };
}

const ascaris = { species: "Ascaris lumbricoides", count: 3 };
const hookworm = { species: "Hookworm", count: 1 };

describe("summariseDashboard", () => {
  it("counts examined and positive smears the way barangay_prevalence does", () => {
    const figures = summariseDashboard([
      smear({ summary: summary({ isPositive: true, eggCounts: [ascaris] }) }),
      smear(),
      // Opened but never read: no live field. Not examined, so not in the denominator.
      smear({ summary: summary({ fieldCount: 0 }) }),
    ]);
    expect(figures.smearsExamined).toBe(2);
    expect(figures.positiveSmears).toBe(1);
    expect(figures.positiveRate).toBe(0.5);
    expect(figures.fieldsVerified).toBe(10);
  });

  it("counts distinct patients, not smears", () => {
    const figures = summariseDashboard([
      smear({ patientId: "p1" }),
      smear({ patientId: "p1" }),
      smear({ patientId: "p2" }),
    ]);
    expect(figures.patients).toBe(2);
  });

  it("has no rate when nothing was examined", () => {
    expect(summariseDashboard([]).positiveRate).toBeNull();
  });

  it("counts each species once per positive smear, polyparasitism included", () => {
    const figures = summariseDashboard([
      smear({ summary: summary({ isPositive: true, eggCounts: [ascaris, hookworm] }) }),
      smear({ summary: summary({ isPositive: true, eggCounts: [ascaris] }) }),
    ]);
    expect(figures.speciesMix).toEqual([
      { species: "Ascaris lumbricoides", positiveSmears: 2, share: 1 },
      { species: "Hookworm", positiveSmears: 1, share: 0.5 },
    ]);
  });

  it("buckets the trend by Manila week and leaves empty weeks out", () => {
    const figures = summariseDashboard([
      smear({ startedAt: "2026-09-01T02:00:00Z", summary: summary({ isPositive: true }) }),
      smear({ startedAt: "2026-09-03T02:00:00Z" }),
      smear({ startedAt: "2026-09-22T02:00:00Z" }),
    ]);
    expect(figures.trend).toEqual([
      { weekStart: "2026-08-31", examined: 2, positive: 1, rate: 0.5 },
      { weekStart: "2026-09-21", examined: 1, positive: 0, rate: 0 },
    ]);
  });
});

describe("weekStart", () => {
  it("returns the Monday of the Manila week", () => {
    expect(weekStart("2026-09-06T10:00:00Z")).toBe("2026-08-31"); // Sunday 18:00 Manila
    expect(weekStart("2026-09-06T16:30:00Z")).toBe("2026-09-07"); // already Monday in Manila
  });
});
