import { describe, expect, it } from "vitest";
import type { ConsoleAccess } from "./access";
import { isSnoozed, noticeDismissal, noticesFor, shownOn } from "./notices";

const SUPER: ConsoleAccess = { kind: "super_admin" };
const ORG: ConsoleAccess = {
  kind: "org_admin",
  organizationId: "lab-a",
  organizationName: "Lab A",
};
const DAY = 24 * 60 * 60 * 1000;
const now = 1_800_000_000_000;

describe("noticesFor", () => {
  it("asks an admin without an authenticator app to turn on two-step sign-in", () => {
    for (const access of [SUPER, ORG]) {
      const notices = noticesFor(access, { secondFactorOn: false });
      expect(notices.map((notice) => notice.id)).toEqual(["second-factor-off"]);
      expect(notices[0]).toMatchObject({
        tone: "warning",
        action: { label: "Set up now", href: "/settings" },
        dismissible: true,
        snoozeDays: 7,
      });
    }
  });

  it("shows nothing once an app is set up", () => {
    expect(noticesFor(SUPER, { secondFactorOn: true })).toEqual([]);
    expect(noticesFor(ORG, { secondFactorOn: true })).toEqual([]);
  });
});

describe("shownOn", () => {
  const [notice] = noticesFor(ORG, { secondFactorOn: false });

  it("is not shown on the page its action opens", () => {
    expect(shownOn(notice, "/settings")).toBe(false);
    expect(shownOn(notice, "/settings/anything")).toBe(false);
  });

  it("is shown everywhere else", () => {
    expect(shownOn(notice, "/dashboard")).toBe(true);
    expect(shownOn(notice, "/settingsx")).toBe(true);
  });
});

describe("isSnoozed", () => {
  const [notice] = noticesFor(ORG, { secondFactorOn: false });

  it("hides a notice this admin closed within its 7 days", () => {
    expect(isSnoozed(notice, noticeDismissal("u1", now - 6 * DAY), "u1", now)).toBe(true);
  });

  it("brings it back after 7 days", () => {
    expect(isSnoozed(notice, noticeDismissal("u1", now - 7 * DAY), "u1", now)).toBe(false);
  });

  it("ignores another admin's dismissal on the same browser", () => {
    expect(isSnoozed(notice, noticeDismissal("u2", now - DAY), "u1", now)).toBe(false);
  });

  it("ignores no dismissal, a malformed one and one from the future", () => {
    expect(isSnoozed(notice, undefined, "u1", now)).toBe(false);
    expect(isSnoozed(notice, "garbage", "u1", now)).toBe(false);
    expect(isSnoozed(notice, "u1.soon", "u1", now)).toBe(false);
    expect(isSnoozed(notice, noticeDismissal("u1", now + DAY), "u1", now)).toBe(false);
  });

  it("never hides a notice that cannot be closed", () => {
    const fixed = { ...notice, dismissible: false };
    expect(isSnoozed(fixed, noticeDismissal("u1", now - DAY), "u1", now)).toBe(false);
  });
});
