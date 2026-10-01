import { describe, expect, it } from "vitest";
import { auditActionLabel, describeAuditEntry, type AuditEntry } from "./audit";

function entry(overrides: Partial<AuditEntry>): AuditEntry {
  return {
    id: 1,
    at: "2026-09-30T00:00:00Z",
    actorId: "u",
    actorLabel: "Sam",
    action: "organization.create",
    targetType: "organization",
    targetId: "o",
    organizationId: "o",
    organizationName: "Lab A",
    details: {},
    ...overrides,
  };
}

describe("describeAuditEntry", () => {
  it("says what was created and renamed", () => {
    expect(describeAuditEntry(entry({ details: { name: "Lab A" } }))).toBe("Created Lab A");
    expect(
      describeAuditEntry(
        entry({ action: "organization.rename", details: { from: "Lab A", to: "Lab Alpha" } }),
      ),
    ).toBe("Renamed Lab A to Lab Alpha");
  });

  it("describes an export with its size, format and period", () => {
    expect(
      describeAuditEntry(
        entry({
          action: "export.research",
          details: { rows: 12, format: "csv", from: "2026-09-01", to: "2026-09-30" },
        }),
      ),
    ).toBe("Exported 12 smears as CSV, 2026-09-01 to 2026-09-30");
    expect(
      describeAuditEntry(
        entry({ action: "export.research", details: { rows: 1, format: "json" } }),
      ),
    ).toBe("Exported 1 smear as JSON, all time");
  });

  it("shows an unknown action as recorded rather than hiding it", () => {
    expect(describeAuditEntry(entry({ action: "member.invite" }))).toBe("member.invite");
    expect(auditActionLabel("member.invite")).toBe("member.invite");
  });
});
