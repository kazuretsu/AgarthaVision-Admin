import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { summariseSession, type SessionSummary } from "@/domain";
import { LpfInline, LpfTable } from "./LpfTable";

/** Visible text, tags stripped, so a test reads what a medtech reads. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

// Two fields: Ascaris 4 and 1 (few), Trichuris 8 (moderate), Hookworm 12 (numerous).
const read: SessionSummary = summariseSession({
  samples: [
    { id: "a", deletedAt: null },
    { id: "b", deletedAt: null },
  ],
  detections: [],
  findings: [
    { sampleId: "a", species: "Ascaris lumbricoides", eggCount: 4 },
    { sampleId: "b", species: "Ascaris lumbricoides", eggCount: 1 },
    { sampleId: "a", species: "Trichuris trichiura", eggCount: 8 },
    { sampleId: "a", species: "Hookworm", eggCount: 12 },
  ],
});
const neverRead = summariseSession({ samples: [], detections: [], findings: [] });
// One field read, nothing found in it.
const readClean: SessionSummary = summariseSession({
  samples: [{ id: "a", deletedAt: null }],
  detections: [],
  findings: [],
});

describe("LpfTable", () => {
  it("shows each species' descriptor and burden as the app writes it", () => {
    const shown = text(renderToStaticMarkup(createElement(LpfTable, { summary: read })));
    expect(shown).toContain("Ascaris lumbricoides 1–4 LPF Few · Low Burden");
    expect(shown).toContain("Hookworm 0–12 LPF Numerous · High Burden");
    expect(shown).toContain("Trichuris trichiura 0–8 LPF Moderate · Moderate Burden");
  });

  it("shows no burden for a species without a range", () => {
    const eggsOnly = { ...read, lpf: {}, eggCounts: [{ species: "Hookworm", count: 2 }] };
    const shown = text(renderToStaticMarkup(createElement(LpfTable, { summary: eggsOnly })));
    expect(shown).toContain("Hookworm — — 2");
    expect(shown).not.toMatch(/Burden/);
  });

  it("never calls the reading an infection intensity", () => {
    const shown = text(renderToStaticMarkup(createElement(LpfTable, { summary: read })));
    expect(shown).not.toMatch(/intensity/i);
  });

  it("says a session never read is not read, not that no parasites were found", () => {
    const shown = text(renderToStaticMarkup(createElement(LpfTable, { summary: neverRead })));
    expect(shown).toMatch(/^Not read\./);
    expect(shown).not.toMatch(/No parasites found/);
  });

  it("still says no parasites were found when a read field had none", () => {
    const shown = text(renderToStaticMarkup(createElement(LpfTable, { summary: readClean })));
    expect(shown).toBe("No parasites found in the 1 field examined.");
  });
});

describe("LpfInline", () => {
  it("writes one line per species with its burden", () => {
    const shown = text(renderToStaticMarkup(createElement(LpfInline, { summary: read })));
    expect(shown).toBe(
      "Ascaris lumbricoides 1–4 LPF · Few · Low Burden " +
        "Hookworm 0–12 LPF · Numerous · High Burden " +
        "Trichuris trichiura 0–8 LPF · Moderate · Moderate Burden",
    );
  });

  it("keeps the burden on one line", () => {
    const html = renderToStaticMarkup(createElement(LpfInline, { summary: read }));
    expect(html).toContain('<span class="whitespace-nowrap">Moderate · Moderate Burden</span>');
  });

  it("shows a dash, and no burden, for a session never read", () => {
    const shown = text(renderToStaticMarkup(createElement(LpfInline, { summary: neverRead })));
    expect(shown).toBe("—");
  });

  it("still says no parasites were found when a read field had none", () => {
    const shown = text(renderToStaticMarkup(createElement(LpfInline, { summary: readClean })));
    expect(shown).toBe("No parasites found");
  });
});
