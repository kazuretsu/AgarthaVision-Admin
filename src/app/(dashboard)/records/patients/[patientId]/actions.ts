"use server";

import { revalidatePath } from "next/cache";
import { getAdminWrites } from "@/adapters/registry";
import { isUuid, validateRevokeReason, validateShareReason } from "@/domain";
import { getConsoleActor } from "@/lib/console-access";
import { MissingEnvironmentError } from "@/lib/env";
import { AdminWriteError, NotAuthenticatedError, NotAuthorizedError } from "@/ports";

export interface ShareFormState {
  error: string | null;
  done: string | null;
}

export const INITIAL_SHARE_STATE: ShareFormState = {
  error: null,
  done: null,
};

function explain(cause: unknown): ShareFormState {
  if (cause instanceof AdminWriteError) {
    if (cause.hint === "reason_required") {
      return { error: "A stated reason is required.", done: null };
    }
    if (cause.hint === "same_organization") {
      return { error: "Cannot share a patient with the owning laboratory.", done: null };
    }
    if (cause.hint === "already_shared") {
      return { error: "This patient is already shared with that laboratory.", done: null };
    }
    if (cause.hint === "target_org_inactive") {
      return { error: "The target laboratory is not active.", done: null };
    }
    if (cause.hint === "not_owning_admin") {
      return {
        error: "Only the owning organization admin can share or revoke access.",
        done: null,
      };
    }
    const messages = {
      forbidden: "You do not have permission to perform this action.",
      not_found: "That record no longer exists.",
      conflict: "This patient is already shared with that laboratory.",
      invalid: "Invalid parameters provided.",
      failed: "The change could not be saved. Try again.",
    } as const;
    return { error: messages[cause.reason] ?? "An unexpected error occurred.", done: null };
  }
  if (cause instanceof MissingEnvironmentError) {
    return { error: `Server is not configured: ${cause.variable} is not set.`, done: null };
  }
  throw cause;
}

export async function sharePatientAction(
  _previous: ShareFormState,
  formData: FormData,
): Promise<ShareFormState> {
  try {
    const actor = await getConsoleActor();
    if (actor.access.kind !== "super_admin" && actor.access.kind !== "org_admin") {
      return {
        error: "Only an organization admin or super admin can share a patient.",
        done: null,
      };
    }

    const patientId = String(formData.get("patientId") ?? "");
    const targetOrganizationId = String(formData.get("targetOrganizationId") ?? "");
    const reason = String(formData.get("reason") ?? "");

    if (!isUuid(patientId) || !isUuid(targetOrganizationId)) {
      return { error: "Invalid patient or laboratory selection.", done: null };
    }

    const reasonError = validateShareReason(reason);
    if (reasonError) {
      return { error: reasonError, done: null };
    }

    const writes = await getAdminWrites();
    await writes.sharePatient(patientId, targetOrganizationId, reason.trim());

    revalidatePath(`/records/patients/${patientId}`);
    return { error: null, done: "Patient shared successfully." };
  } catch (cause) {
    if (cause instanceof NotAuthenticatedError) {
      return { error: "Your session has ended. Sign in again.", done: null };
    }
    if (cause instanceof NotAuthorizedError) {
      return { error: "You are not authorized to share this patient.", done: null };
    }
    return explain(cause);
  }
}

export async function revokePatientShareAction(
  _previous: ShareFormState,
  formData: FormData,
): Promise<ShareFormState> {
  try {
    const actor = await getConsoleActor();
    if (actor.access.kind !== "super_admin" && actor.access.kind !== "org_admin") {
      return { error: "Only an organization admin or super admin can revoke a share.", done: null };
    }

    const shareId = String(formData.get("shareId") ?? "");
    const patientId = String(formData.get("patientId") ?? "");
    const reason = String(formData.get("reason") ?? "");

    if (!isUuid(shareId) || !isUuid(patientId)) {
      return { error: "Invalid share or patient ID.", done: null };
    }

    const reasonError = validateRevokeReason(reason);
    if (reasonError) {
      return { error: reasonError, done: null };
    }

    const writes = await getAdminWrites();
    await writes.revokePatientShare(shareId, reason.trim());

    revalidatePath(`/records/patients/${patientId}`);
    return { error: null, done: "Share access revoked." };
  } catch (cause) {
    if (cause instanceof NotAuthenticatedError) {
      return { error: "Your session has ended. Sign in again.", done: null };
    }
    if (cause instanceof NotAuthorizedError) {
      return { error: "You are not authorized to revoke this share.", done: null };
    }
    return explain(cause);
  }
}
