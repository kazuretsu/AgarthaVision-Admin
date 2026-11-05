import { describe, expect, it } from "vitest";
import {
  canResetSecondFactor,
  readSecondFactorCode,
  secondFactorAdmits,
  secondFactorStep,
} from "./second-factor";

describe("secondFactorStep", () => {
  it("passes a session that entered its code", () => {
    expect(secondFactorStep({ sessionPassed: true, hasAuthenticator: true })).toBe("passed");
  });

  it("asks for the code when an app is set up and this session has not entered one", () => {
    expect(secondFactorStep({ sessionPassed: false, hasAuthenticator: true })).toBe("enter_code");
  });

  it("has nothing to ask of an admin without an app", () => {
    expect(secondFactorStep({ sessionPassed: false, hasAuthenticator: false })).toBe("not_set_up");
  });
});

describe("secondFactorAdmits", () => {
  it("admits a passed session and an account with no app (14zcqntr31c)", () => {
    expect(secondFactorAdmits("passed")).toBe(true);
    expect(secondFactorAdmits("not_set_up")).toBe(true);
  });

  it("holds back an account with an app until its code is entered", () => {
    expect(secondFactorAdmits("enter_code")).toBe(false);
  });
});

describe("readSecondFactorCode", () => {
  it("accepts six digits, dropping the spaces apps show and people paste", () => {
    expect(readSecondFactorCode("123456")).toBe("123456");
    expect(readSecondFactorCode(" 123 456 ")).toBe("123456");
  });

  it("refuses anything else before the provider is asked", () => {
    expect(readSecondFactorCode(null)).toBeNull();
    expect(readSecondFactorCode("")).toBeNull();
    expect(readSecondFactorCode("12345")).toBeNull();
    expect(readSecondFactorCode("1234567")).toBeNull();
    expect(readSecondFactorCode("12345a")).toBeNull();
    expect(readSecondFactorCode(new Blob(["123456"]))).toBeNull();
  });
});

describe("canResetSecondFactor", () => {
  const superAdmin = { kind: "super_admin" } as const;
  const orgAdmin = {
    kind: "org_admin",
    organizationId: "org-1",
    organizationName: "Lab",
  } as const;
  const lostPhone = { userId: "u-2", accountId: "u-2", role: "org_admin" } as const;

  it("lets a super admin reset an org admin's app", () => {
    expect(canResetSecondFactor(superAdmin, "u-1", lostPhone)).toBe(true);
  });

  it("refuses an org admin, even for another org admin", () => {
    expect(canResetSecondFactor(orgAdmin, "u-1", lostPhone)).toBe(false);
  });

  it("refuses resetting yourself", () => {
    expect(canResetSecondFactor(superAdmin, "u-2", lostPhone)).toBe(false);
  });

  it("refuses a medtech, who has no console app, and a profile with no login", () => {
    expect(canResetSecondFactor(superAdmin, "u-1", { ...lostPhone, role: "medtech" })).toBe(false);
    expect(canResetSecondFactor(superAdmin, "u-1", { ...lostPhone, accountId: null })).toBe(false);
  });
});
