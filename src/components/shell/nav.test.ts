import { describe, expect, it } from "vitest";
import { NAV_ITEMS, navFor, sectionFor } from "./nav";

describe("navFor", () => {
  it("shows a super admin every entry listing them", () => {
    expect(navFor("super_admin")).toEqual(
      NAV_ITEMS.filter((item) => item.visibleTo.includes("super_admin")),
    );
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

describe("people", () => {
  it("is everyone's entry: an org admin's own laboratory, a super admin's choice", () => {
    expect(navFor("org_admin").some((item) => item.href === "/people")).toBe(true);
    expect(navFor("super_admin").some((item) => item.href === "/people")).toBe(true);
  });
});

describe("training data", () => {
  it("is a super admin's entry only", () => {
    expect(navFor("super_admin").some((item) => item.href === "/training-data")).toBe(true);
    expect(navFor("org_admin").some((item) => item.href === "/training-data")).toBe(false);
  });
});

describe("prevalence map", () => {
  it("is everyone's entry: an org admin's own laboratory, a super admin's choice", () => {
    expect(navFor("org_admin").some((item) => item.href === "/map")).toBe(true);
    expect(navFor("super_admin").some((item) => item.href === "/map")).toBe(true);
  });
});

describe("sectionFor — where the not-found page's button goes (14zcqntk6h4)", () => {
  const superAdmin = navFor("super_admin");
  const orgAdmin = navFor("org_admin");
  const href = (pathname: string, items = superAdmin) => sectionFor(pathname, items).href;

  it("sends a record back to Records, whatever kind of record", () => {
    expect(href("/records/patients/not-a-uuid")).toBe("/records");
    expect(href("/records/sessions/00000000-0000-4000-8000-000000000001")).toBe("/records");
    expect(href("/records/samples/00000000-0000-4000-8000-000000000001", orgAdmin)).toBe(
      "/records",
    );
  });

  it("sends a super admin's unknown organization back to Organizations", () => {
    expect(href("/organizations/00000000-0000-4000-8000-000000000001")).toBe("/organizations");
  });

  it("sends an org admin to the dashboard from a section they cannot open", () => {
    expect(href("/organizations", orgAdmin)).toBe("/dashboard");
    expect(href("/training-data", orgAdmin)).toBe("/dashboard");
  });

  it("matches whole path segments only", () => {
    expect(href("/recordsx")).toBe("/dashboard");
    expect(href("/map")).toBe("/map");
    expect(href("/people/00000000-0000-4000-8000-000000000001")).toBe("/people");
  });
});
