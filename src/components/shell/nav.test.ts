import { describe, expect, it } from "vitest";
import { NAV_ITEMS, navFor } from "./nav";

describe("navFor", () => {
  it("shows a super admin every entry", () => {
    expect(navFor("super_admin")).toEqual([...NAV_ITEMS]);
  });

  it("shows an org admin only the entries listing them", () => {
    for (const item of navFor("org_admin")) expect(item.visibleTo).toContain("org_admin");
  });
});

describe("organizations", () => {
  it("is a super admin's entry only", () => {
    expect(navFor("super_admin").some((item) => item.href === "/organizations")).toBe(true);
    expect(navFor("org_admin").some((item) => item.href === "/organizations")).toBe(false);
  });
});
