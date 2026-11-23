import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CheckedReport } from "@/domain/report-check";
import type { ReportCheckPageState } from "@/lib/report-check";
import { ReportCheckView } from "./ReportCheckView";

const render = (state: ReportCheckPageState) =>
  renderToStaticMarkup(createElement(ReportCheckView, { state }));

const REPORT: CheckedReport = {
  reportType: "session",
  generatedAt: "2026-11-22T14:05:05Z",
  laboratoryName: "Report Check Lab",
  totalSamples: 10,
  totalEggsConfirmed: 7,
  positiveSpecies: ["Ascaris lumbricoides"],
  lpfPerSpecies: { "Ascaris lumbricoides": { min: 0, max: 4 } },
};

describe("ReportCheckView (14zcqnty9bj)", () => {
  it("AC2 confirms a known report and shows its stored findings", () => {
    const html = render({ kind: "confirmed", report: REPORT });
    expect(html).toContain("This report is in AgarthaVision&#x27;s records.");
    expect(html).toContain("Report Check Lab");
    expect(html).toContain("Session report");
    expect(html).toContain("Fields examined");
    expect(html).toContain(">10<");
    expect(html).toContain(">7<");
    expect(html).toContain("Ascaris lumbricoides");
    expect(html).toContain("0–4 LPF");
  });

  it("AC2 says so when a report found no parasites", () => {
    const html = render({
      kind: "confirmed",
      report: { ...REPORT, positiveSpecies: [], lpfPerSpecies: {} },
    });
    expect(html).toContain("No parasites found.");
  });

  it("AC3 shows no patient or medtech identity", () => {
    const html = render({ kind: "confirmed", report: REPORT });
    expect(html).not.toMatch(/patient name|birthdate|address|@|medtech/i);
    expect(html).toContain("This page shows no patient details.");
  });

  it("AC4 says an altered link cannot be confirmed, and shows no findings", () => {
    const html = render({ kind: "mismatch" });
    expect(html).toContain("This report can&#x27;t be confirmed.");
    expect(html).toContain("may have been altered");
    expect(html).not.toContain("LPF");
  });

  it("AC5 says no report matches, and that offline reports appear after syncing", () => {
    const html = render({ kind: "not_found" });
    expect(html).toContain("No report matches this code.");
    expect(html).toContain("appears here once the phone has synced");
  });

  it("AC6 says to wait when the attempt limit is reached", () => {
    expect(render({ kind: "too_many" })).toContain("Too many attempts. Try again in 15 minutes.");
  });

  it("says when the check could not be made", () => {
    expect(render({ kind: "unavailable" })).toContain("could not be checked right now");
  });
});
