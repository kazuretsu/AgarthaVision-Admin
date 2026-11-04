import { describe, expect, it } from "vitest";
import {
  canRevokeShare,
  canSharePatient,
  isShareActive,
  validateRevokeReason,
  validateShareReason,
} from "./patient-shares";
import type { ConsoleAccess } from "./access";

describe("patient shares domain logic", () => {
  const superAdmin: ConsoleAccess = { kind: "super_admin" };
  const orgAdmin: ConsoleAccess = {
    kind: "org_admin",
    organizationId: "11111111-1111-4000-8000-111111111111",
    organizationName: "Lab Alpha",
  };

  describe("canSharePatient", () => {
    it("permits super admin regardless of ownership", () => {
      expect(canSharePatient(superAdmin, true)).toBe(true);
      expect(canSharePatient(superAdmin, false)).toBe(true);
    });

    it("permits org admin only if they own the patient", () => {
      expect(canSharePatient(orgAdmin, true)).toBe(true);
      expect(canSharePatient(orgAdmin, false)).toBe(false);
    });
  });

  describe("canRevokeShare", () => {
    it("permits super admin regardless of ownership", () => {
      expect(canRevokeShare(superAdmin, true)).toBe(true);
      expect(canRevokeShare(superAdmin, false)).toBe(true);
    });

    it("permits org admin only if they own the patient", () => {
      expect(canRevokeShare(orgAdmin, true)).toBe(true);
      expect(canRevokeShare(orgAdmin, false)).toBe(false);
    });
  });

  describe("isShareActive", () => {
    it("returns true when revokedAt is null", () => {
      expect(isShareActive({ revokedAt: null })).toBe(true);
    });

    it("returns false when revokedAt is populated", () => {
      expect(isShareActive({ revokedAt: "2026-11-04T12:00:00Z" })).toBe(false);
    });
  });

  describe("validateShareReason", () => {
    it("rejects empty or whitespace-only reason", () => {
      expect(validateShareReason("")).toBe("Please provide a reason for sharing this patient.");
      expect(validateShareReason("   ")).toBe("Please provide a reason for sharing this patient.");
    });

    it("accepts valid reasons", () => {
      expect(validateShareReason("Second opinion on parasite identification")).toBeNull();
    });

    it("rejects reason longer than 500 chars", () => {
      expect(validateShareReason("a".repeat(501))).toBe("Reason cannot exceed 500 characters.");
    });
  });

  describe("validateRevokeReason", () => {
    it("rejects empty or whitespace-only reason", () => {
      expect(validateRevokeReason("")).toBe("Please provide a reason for revoking access.");
      expect(validateRevokeReason("   ")).toBe("Please provide a reason for revoking access.");
    });

    it("accepts valid reasons", () => {
      expect(validateRevokeReason("Referral consultation completed")).toBeNull();
    });

    it("rejects reason longer than 500 chars", () => {
      expect(validateRevokeReason("a".repeat(501))).toBe("Reason cannot exceed 500 characters.");
    });
  });
});
