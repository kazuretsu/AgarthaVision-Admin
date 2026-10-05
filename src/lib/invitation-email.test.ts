import { describe, expect, it } from "vitest";
import { invitationEmail } from "./invitation-email";

const BASE = {
  to: "ana@example.test",
  fullName: "Ana <Cruz>",
  role: "medtech" as const,
  organizationName: "Lab & Co",
  inviterName: "Org Admin",
  link: "https://console.example.test/invite/" + "a".repeat(64),
  expiresAt: "2026-10-12T04:00:00Z",
};

describe("invitationEmail", () => {
  it("carries the link and never a password", () => {
    const mail = invitationEmail(BASE);
    expect(mail.to).toBe("ana@example.test");
    expect(mail.text).toContain(BASE.link);
    expect(mail.html).toContain(BASE.link);
    expect(`${mail.text}${mail.html}`).not.toMatch(/your password is/i);
  });

  it("escapes names in the HTML", () => {
    const mail = invitationEmail(BASE);
    expect(mail.html).toContain("Ana &lt;Cruz&gt;");
    expect(mail.html).toContain("Lab &amp; Co");
    expect(mail.html).not.toContain("<Cruz>");
  });

  it("sends a medtech to the app and an org admin to the console", () => {
    expect(invitationEmail(BASE).text).toContain("mobile app");
    const admin = invitationEmail({ ...BASE, role: "org_admin" });
    expect(admin.text).toContain("an organization admin");
    expect(admin.text).toContain("Admin Console");
  });

  it("says when the link stops working, in Philippine time", () => {
    expect(invitationEmail(BASE).text).toContain("Oct 12, 2026");
    expect(invitationEmail(BASE).text).toContain("Philippine time");
  });
});
