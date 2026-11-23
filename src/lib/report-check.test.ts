import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AttemptCounts } from "@/domain/attempt-limits";
import { ReportCheckError } from "@/ports/report-check";
import { checkReportLink } from "./report-check";

const { checkReport, countFailures, recordFailure } = vi.hoisted(() => ({
  checkReport: vi.fn(),
  countFailures: vi.fn(),
  recordFailure: vi.fn(),
}));

vi.mock("@/adapters/registry", () => ({
  getReportCheck: async () => ({ checkReport }),
  getAttemptLimit: async () => ({ countFailures, recordFailure }),
}));

const LINK = {
  id: "3f2b8c1e-6a4d-4e2f-9b7a-1c2d3e4f5a6b",
  session: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
  ts: "1795356305",
};
const NONE: AttemptCounts = { email: 0, ip: 0, invitation: 0 };
const CONFIRMED = {
  kind: "confirmed",
  report: {
    reportType: "session",
    generatedAt: "2026-11-22T14:05:05Z",
    laboratoryName: "Lab",
    totalSamples: 1,
    totalEggsConfirmed: 0,
    positiveSpecies: [],
    lpfPerSpecies: {},
  },
} as const;

describe("checkReportLink (14zcqnty9bj)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    countFailures.mockResolvedValue(NONE);
  });

  it("AC2 returns a confirmed report and records nothing", async () => {
    checkReport.mockResolvedValue(CONFIRMED);
    await expect(checkReportLink(LINK, "203.0.113.9")).resolves.toEqual(CONFIRMED);
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("AC5 answers a malformed link as unknown without asking the database", async () => {
    await expect(checkReportLink({ id: "nope" }, "203.0.113.9")).resolves.toEqual({
      kind: "not_found",
    });
    expect(checkReport).not.toHaveBeenCalled();
    expect(countFailures).not.toHaveBeenCalled();
  });

  it("AC6 counts an unknown report and an altered link as failed checks for this IP", async () => {
    checkReport.mockResolvedValueOnce({ kind: "not_found" });
    await expect(checkReportLink(LINK, "203.0.113.9")).resolves.toEqual({ kind: "not_found" });
    checkReport.mockResolvedValueOnce({ kind: "mismatch" });
    await expect(checkReportLink(LINK, "203.0.113.9")).resolves.toEqual({ kind: "mismatch" });
    expect(recordFailure).toHaveBeenCalledTimes(2);
    expect(recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "report_check",
        email: "report-check:203.0.113.9",
        ip: null,
      }),
    );
  });

  it("AC6 refuses the check past the limit, before the database is asked", async () => {
    countFailures.mockResolvedValue({ ...NONE, email: 5 });
    await expect(checkReportLink(LINK, "203.0.113.9")).resolves.toEqual({ kind: "too_many" });
    expect(checkReport).not.toHaveBeenCalled();
  });

  it("says a check that could not be made is unavailable, and does not count it", async () => {
    checkReport.mockRejectedValue(new ReportCheckError());
    await expect(checkReportLink(LINK, "203.0.113.9")).resolves.toEqual({ kind: "unavailable" });
    expect(recordFailure).not.toHaveBeenCalled();
  });
});
