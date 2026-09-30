/**
 * Who may use the console, and what each kind of user may reach.
 *
 * Three people sign in with the same credentials (Feature Specs §1):
 *
 * - **Super admin** — an application owner. `profiles.role = 'admin'`. Sees every
 *   organization.
 * - **Org admin** — one laboratory's administrator. A role on their organization
 *   membership, never on the profile, so it cannot outlive the membership.
 * - **Medtech** — uses the Android app. Has no console access at all.
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

/** True when this access kind is one of the kinds a page or action allows. */
export function isAllowed(access: ConsoleAccess, allowed: readonly ConsoleAccessKind[]): boolean {
  return allowed.includes(access.kind);
}

/** The label the console header shows for each kind of access. */
export function accessLabel(access: ConsoleAccess): string {
  return access.kind === "super_admin" ? "Super admin" : "Org admin";
}
