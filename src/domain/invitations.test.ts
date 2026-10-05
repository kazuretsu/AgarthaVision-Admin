import { describe, expect, it } from "vitest";
import type { ConsoleAccess } from "./access";
import {
  canInviteInto,
  canManageInvitation,
  checkNewPassword,
  invitableRole,
  invitationState,
  normaliseInvitee,
} from "./invitations";

const SUPER: ConsoleAccess = { kind: "super_admin" };
const ADMIN_A: ConsoleAccess = {
  kind: "org_admin",
  organizationId: "lab-a",
  organizationName: "Lab A",
};

describe("who invites whom", () => {
  it("a super admin invites org admins, into any organization", () => {
    expect(invitableRole(SUPER)).toBe("org_admin");
    expect(canInviteInto(SUPER, "lab-a")).toBe(true);
    expect(canInviteInto(SUPER, "lab-b")).toBe(true);
  });

  it("an org admin invites medtechs, into their own organization only", () => {
    expect(invitableRole(ADMIN_A)).toBe("medtech");
    expect(canInviteInto(ADMIN_A, "lab-a")).toBe(true);
    expect(canInviteInto(ADMIN_A, "lab-b")).toBe(false);
  });

  it("an org admin manages only medtech invitations in their organization", () => {
    expect(canManageInvitation(ADMIN_A, { organizationId: "lab-a", role: "medtech" })).toBe(true);
    expect(canManageInvitation(ADMIN_A, { organizationId: "lab-a", role: "org_admin" })).toBe(
      false,
    );
    expect(canManageInvitation(ADMIN_A, { organizationId: "lab-b", role: "medtech" })).toBe(false);
    expect(canManageInvitation(SUPER, { organizationId: "lab-b", role: "org_admin" })).toBe(true);
  });
});

describe("invitationState", () => {
  const now = new Date("2026-10-05T00:00:00Z");

  it("a pending invitation past its expiry is expired", () => {
    expect(invitationState({ status: "pending", expiresAt: "2026-10-04T23:59:59Z" }, now)).toBe(
      "expired",
    );
    expect(invitationState({ status: "pending", expiresAt: "2026-10-05T00:00:01Z" }, now)).toBe(
      "pending",
    );
  });

  it("accepted and revoked stay what they are, whatever the date", () => {
    expect(invitationState({ status: "accepted", expiresAt: "2020-01-01T00:00:00Z" }, now)).toBe(
      "accepted",
    );
    expect(invitationState({ status: "revoked", expiresAt: "2099-01-01T00:00:00Z" }, now)).toBe(
      "revoked",
    );
  });
});

describe("normaliseInvitee", () => {
  it("trims and lower-cases the email and spaces the name once", () => {
    expect(normaliseInvitee("  Ana.Cruz@Example.COM ", "  Ana   Cruz ")).toEqual({
      ok: true,
      email: "ana.cruz@example.com",
      fullName: "Ana Cruz",
    });
  });

  it("an empty name is no name", () => {
    expect(normaliseInvitee("a@b.co", "   ")).toMatchObject({ ok: true, fullName: null });
  });

  it("refuses what is not an email address", () => {
    for (const email of ["", "ana", "ana@", "ana@example", "a b@example.com"]) {
      expect(normaliseInvitee(email, "").ok).toBe(false);
    }
  });

  it("refuses a name over 120 characters", () => {
    expect(normaliseInvitee("a@b.co", "x".repeat(121)).ok).toBe(false);
  });
});

describe("checkNewPassword", () => {
  it("needs eight characters and a matching confirmation", () => {
    expect(checkNewPassword("short", "short").ok).toBe(false);
    expect(checkNewPassword("long-enough", "long-enougH").ok).toBe(false);
    expect(checkNewPassword("long-enough", "long-enough").ok).toBe(true);
  });

  it("refuses more than bcrypt's 72 bytes", () => {
    const tooLong = "é".repeat(37); // 74 bytes
    expect(checkNewPassword(tooLong, tooLong).ok).toBe(false);
  });
});
