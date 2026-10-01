/**
 * Who may use the console, and what each kind of user may reach.
 *
 * Three tiers (Feature Specs §1), each with its own client:
 *
 * - **Super admin** — the AgarthaVision developers and owners. Platform-wide, in no
 *   organization: `profiles.role = 'admin'`. Uses this console.
 * - **Organization admin** — a clinic's own admin staff, who manage the data that
 *   clinic's medtechs create. A role on their organization membership, never on the
 *   profile, so it ends with the membership. Uses this console.
 * - **Medtech** — the end user. Uses the mobile app only; has no console access.
 *
 * `profiles.role` is `'medtech'` for everyone who is not a super admin, organization
 * admins included: it says "not a super admin", and the membership says the rest.
 *
 * These rules live here, in plain TypeScript, and run before every read and write
 * the console makes (D7). Database policies are the second line, not the only one:
 * they key on Supabase's `auth.uid()` and would stop applying under another
 * provider.
 */

/** What a signed-in person may do in the console. A medtech has no value here. */
export type ConsoleAccess =
  { kind: "super_admin" } | { kind: "org_admin"; organizationId: string; organizationName: string };

export type ConsoleAccessKind = ConsoleAccess["kind"];

/** An org admin's active membership, as the auth adapter reads it. */
export interface OrgAdminMembership {
  organizationId: string;
  organizationName: string;
}

/**
 * Resolves console access from the two facts the auth adapter reads server-side.
 *
 * The profile role wins: a super admin who also holds a membership is still a
 * super admin, because narrowing them to one laboratory would hide the rest of
 * the system from the people who run it.
 */
export function resolveConsoleAccess(
  profileRole: "medtech" | "admin",
  membership: OrgAdminMembership | null,
): ConsoleAccess | null {
  if (profileRole === "admin") return { kind: "super_admin" };
  if (membership) {
    return {
      kind: "org_admin",
      organizationId: membership.organizationId,
      organizationName: membership.organizationName,
    };
  }
  return null;
}

/**
 * Whether a reader is shown who a patient is: name, sex and birthdate.
 *
 * Each clinic is the controller of its patients' data under RA 10173, and
 * AgarthaVision hosts it as the clinic's processor. An organization admin is the
 * clinic's own staff and sees its patients identified. A super admin runs the
 * platform — organizations, accounts, model quality, aggregate figures — none of
 * which needs a name or a birthdate, so proportionality (§11) keeps them out:
 * records reach a super admin de-identified, as the research export already does.
 */
export type PatientDisclosure = "identified" | "deidentified";

export function patientDisclosureFor(access: ConsoleAccess): PatientDisclosure {
  return access.kind === "org_admin" ? "identified" : "deidentified";
}

/** True when this access kind is one of the kinds a page or action allows. */
export function isAllowed(access: ConsoleAccess, allowed: readonly ConsoleAccessKind[]): boolean {
  return allowed.includes(access.kind);
}

/** The label the console header shows for each kind of access. */
export function accessLabel(access: ConsoleAccess): string {
  return access.kind === "super_admin" ? "Super admin" : "Organization admin";
}
