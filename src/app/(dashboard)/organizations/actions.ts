"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccountAccess, getAdminWrites, getDatabase } from "@/adapters/registry";
import { canManageOrganizations, isUuid, normaliseOrganizationName } from "@/domain";
import { AdminWriteError, NotAuthenticatedError, NotAuthorizedError } from "@/ports";
import { getConsoleActor } from "@/lib/console-access";
import { signInFollowsAccess } from "@/lib/sign-in-follows-access";
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

  const writes = await getAdminWrites();
  try {
    await writes.setOrganizationStatus(id, status);
  } catch (cause) {
    return explain(cause);
  }
  revalidatePath("/organizations");
  revalidatePath(`/organizations/${id}`);

  // Then sign-in follows (14zcqntnqpd): everyone the change leaves with no access is blocked,
  // so the mobile app stops too; a reactivation restores those with access again.
  const deactivated = status === "deactivated";
  let unchanged: number;
  try {
    const members = (await (await getDatabase()).listPeople(id)).map((person) => person.userId);
    unchanged = (
      await signInFollowsAccess(
        writes,
        await getAccountAccess(),
        members,
        deactivated,
        deactivated ? "organization.deactivate" : "organization.reactivate",
      )
    ).failed;
  } catch (cause) {
    console.error("Sign-in not changed after an organization status change", cause);
    unchanged = -1;
  }
  if (unchanged !== 0) {
    const who = unchanged > 0 ? `${unchanged} member${unchanged === 1 ? "" : "s"}` : "its members";
    return {
      error: deactivated
        ? `Organization deactivated, but ${who} could not be blocked from signing in, so the mobile app may keep working for them. Reactivate and deactivate it again to retry.`
        : `Organization reactivated, but ${who} could not be allowed to sign in again. Deactivate and reactivate it again to retry.`,
      done: null,
    };
  }
  return {
    error: null,
    done: deactivated
      ? "Organization deactivated. Its members can no longer sign in, in the console or the mobile app."
      : "Organization reactivated. Its active members can sign in again.",
  };
}
