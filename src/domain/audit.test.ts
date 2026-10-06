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

describe("invitation entries", () => {
  it("say who was invited, as what, and where", () => {
    const details = { email: "ana@example.test", role: "medtech" };
    expect(describeAuditEntry(entry({ action: "invitation.create", details }))).toBe(
      "Invited ana@example.test as a medtech to Lab A",
    );
    expect(
      describeAuditEntry(
        entry({ action: "invitation.accept", details: { ...details, role: "org_admin" } }),
      ),
    ).toBe("ana@example.test joined Lab A as an organization admin");
    expect(describeAuditEntry(entry({ action: "invitation.resend", details }))).toBe(
      "Re-sent the invitation to ana@example.test",
    );
    expect(describeAuditEntry(entry({ action: "invitation.revoke", details }))).toBe(
      "Revoked the invitation to ana@example.test",
    );
  });

  it("are filterable actions on the audit page", () => {
    for (const action of ["create", "resend", "revoke", "accept"]) {
      expect(auditActionLabel(`invitation.${action}`)).not.toBe(`invitation.${action}`);
    }
  });
});

describe("member entries", () => {
  it("name the medtech and the laboratory", () => {
    expect(
      describeAuditEntry(entry({ action: "member.deactivate", details: { name: "Tess Tech" } })),
    ).toBe("Deactivated Tess Tech in Lab A");
    expect(
      describeAuditEntry(entry({ action: "member.reactivate", details: { name: "Tess Tech" } })),
    ).toBe("Reactivated Tess Tech in Lab A");
  });
});

describe("assignment entries", () => {
  it("name the patient by record id only, and the medtech, from admin/0007 entries", () => {
    const base = { targetId: "70000000-0000-4000-8000-000000000001", details: { medtech: "Ana" } };
    expect(describeAuditEntry(entry({ ...base, action: "assignment.add" }))).toBe(
      "Assigned patient 70000000 to Ana",
    );
    expect(describeAuditEntry(entry({ ...base, action: "assignment.remove" }))).toBe(
      "Removed patient 70000000 from Ana",
    );
  });

  it("name the member, org admins included, from entries written since admin/0008", () => {
    const base = {
      targetId: "70000000-0000-4000-8000-000000000001",
      details: { member: "Olga Admin", role: "org_admin" },
    };
    expect(describeAuditEntry(entry({ ...base, action: "assignment.add" }))).toBe(
      "Assigned patient 70000000 to Olga Admin",
    );
    expect(describeAuditEntry(entry({ ...base, details: {}, action: "assignment.remove" }))).toBe(
      "Removed patient 70000000 from someone",
    );
  });
});
