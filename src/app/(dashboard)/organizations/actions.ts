"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminWrites } from "@/adapters/registry";
import { canManageOrganizations, isUuid, normaliseOrganizationName } from "@/domain";
import { AdminWriteError, NotAuthenticatedError, NotAuthorizedError } from "@/ports";
import { getConsoleActor } from "@/lib/console-access";
import type { OrganizationFormState } from "./state";

/**
 * Organization writes. Each one checks the domain rule here first (D7); the
 * database function checks again and writes the audit row with the change.
 */

const NOT_PERMITTED: OrganizationFormState = {
  error: "Only a super admin can manage organizations.",
  done: null,
};

const NOT_FOUND: OrganizationFormState = {
  error: "That organization no longer exists.",
  done: null,
};

/** The acting super admin, or the state to return instead. */
async function requireManager(): Promise<OrganizationFormState | null> {
  try {
    const actor = await getConsoleActor();
    return canManageOrganizations(actor.access) ? null : NOT_PERMITTED;
  } catch (cause) {
    if (cause instanceof NotAuthenticatedError || cause instanceof NotAuthorizedError) {
      return NOT_PERMITTED;
    }
    throw cause;
  }
}

function explain(cause: unknown): OrganizationFormState {
  if (cause instanceof AdminWriteError) {
    const messages = {
      forbidden: NOT_PERMITTED.error,
      conflict: "Another organization already has that name.",
      not_found: NOT_FOUND.error,
      invalid: "That value is not allowed.",
      failed: "The change could not be saved. Try again.",
    } as const;
    return { error: messages[cause.reason], done: null };
  }
  throw cause;
}

export async function createOrganization(
  _previous: OrganizationFormState,
  formData: FormData,
): Promise<OrganizationFormState> {
  const refused = await requireManager();
  if (refused) return refused;

  const parsed = normaliseOrganizationName(String(formData.get("name") ?? ""));
  if (!parsed.ok) return { error: parsed.error, done: null };

  let id: string;
  try {
    id = await (await getAdminWrites()).createOrganization(parsed.name);
  } catch (cause) {
    return explain(cause);
  }
  revalidatePath("/organizations");
  redirect(`/organizations/${id}`);
}

export async function renameOrganization(
  _previous: OrganizationFormState,
  formData: FormData,
): Promise<OrganizationFormState> {
  const refused = await requireManager();
  if (refused) return refused;

  const id = String(formData.get("organizationId") ?? "");
  if (!isUuid(id)) return NOT_FOUND;
  const parsed = normaliseOrganizationName(String(formData.get("name") ?? ""));
  if (!parsed.ok) return { error: parsed.error, done: null };

  try {
    await (await getAdminWrites()).renameOrganization(id, parsed.name);
  } catch (cause) {
    return explain(cause);
  }
  revalidatePath("/organizations");
  revalidatePath(`/organizations/${id}`);
  return { error: null, done: "Name saved." };
}

export async function setOrganizationStatus(
  _previous: OrganizationFormState,
  formData: FormData,
): Promise<OrganizationFormState> {
  const refused = await requireManager();
  if (refused) return refused;

  const id = String(formData.get("organizationId") ?? "");
  if (!isUuid(id)) return NOT_FOUND;
  const status = formData.get("status") === "deactivated" ? "deactivated" : "active";

  try {
    await (await getAdminWrites()).setOrganizationStatus(id, status);
  } catch (cause) {
    return explain(cause);
  }
  revalidatePath("/organizations");
  revalidatePath(`/organizations/${id}`);
  return {
    error: null,
    done: status === "deactivated" ? "Organization deactivated." : "Organization reactivated.",
  };
}
