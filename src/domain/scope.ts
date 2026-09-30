import type { ConsoleAccess } from "./access";

/**
 * Which records a console read may return (D11, D7).
 *
 * Every read of clinical data takes a scope, derived here from who is asking —
 * never from what the page was asked for. The database's policies enforce the
 * same boundary; this is the console's own copy of the rule, so it still holds
 * under a provider whose policies do not apply.
 */
export type ReadScope = { kind: "all" } | { kind: "organization"; organizationId: string };

/**
 * An org admin is always held to their own organization, whatever the URL says.
 * A super admin sees everything, or one organization when they ask for it.
 */
export function readScopeFor(
  access: ConsoleAccess,
  requestedOrganizationId?: string | null,
): ReadScope {
  if (access.kind === "org_admin") {
    return { kind: "organization", organizationId: access.organizationId };
  }
  const requested = requestedOrganizationId?.trim();
  return requested && /^[0-9a-f-]{36}$/i.test(requested)
    ? { kind: "organization", organizationId: requested }
    : { kind: "all" };
}
