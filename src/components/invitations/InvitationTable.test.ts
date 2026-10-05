import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ConsoleAccess, Invitation } from "@/domain";

// The row actions are a client component bound to server actions; the table is what is
// under test here, so they render as a marker.
vi.mock("./InvitationForms", () => ({
  InvitationActions: ({ email }: { email: string }) => `[actions:${email}]`,
}));

const { InvitationTable } = await import("./InvitationTable");

const NOW = new Date("2026-10-05T00:00:00Z");

function invitation(overrides: Partial<Invitation>): Invitation {
  return {
    id: "i1",
    organizationId: "lab-a",
    organizationName: "Lab A",
    email: "ana@example.test",
    fullName: null,
    role: "medtech",
    status: "pending",
    expiresAt: "2026-10-10T00:00:00Z",
    invitedAt: "2026-10-03T00:00:00Z",
    invitedById: "u",
    sentCount: 1,
    lastSentAt: "2026-10-03T00:00:00Z",
    acceptedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

const ADMIN_A: ConsoleAccess = {
  kind: "org_admin",
  organizationId: "lab-a",
  organizationName: "Lab A",
};

const shown = (invitations: Invitation[], access: ConsoleAccess = ADMIN_A) =>
  renderToStaticMarkup(
    createElement(InvitationTable, { invitations, access, caption: "Invitations", now: NOW }),
  ).replace(/<[^>]+>/g, " ");

describe("InvitationTable", () => {
  it("says when there are none", () => {
    expect(shown([])).toContain("No invitations yet.");
  });

  it("shows each state, and actions only on open invitations", () => {
    const text = shown([
      invitation({ id: "1", email: "p@x.test" }),
      invitation({ id: "2", email: "e@x.test", expiresAt: "2026-10-01T00:00:00Z" }),
      invitation({ id: "3", email: "a@x.test", status: "accepted", acceptedAt: NOW.toISOString() }),
      invitation({ id: "4", email: "r@x.test", status: "revoked", revokedAt: NOW.toISOString() }),
    ]);
    for (const state of ["Pending", "Expired", "Accepted", "Revoked"]) {
      expect(text).toContain(state);
    }
    expect(text).toContain("[actions:p@x.test]");
    expect(text).toContain("[actions:e@x.test]");
    expect(text).not.toContain("[actions:a@x.test]");
    expect(text).not.toContain("[actions:r@x.test]");
  });

  it("gives an org admin no actions on an organization admin's invitation", () => {
    const text = shown([invitation({ role: "org_admin", email: "boss@x.test" })]);
    expect(text).toContain("Organization admin");
    expect(text).not.toContain("[actions:boss@x.test]");
  });
});
