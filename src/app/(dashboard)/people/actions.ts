"use server";

import { revalidatePath } from "next/cache";
import { getAccountAccess, getAdminWrites, getDatabase } from "@/adapters/registry";
import {
  canChangeMemberStatus,
  isLastActiveOrgAdmin,
  isUuid,
  type OrganizationStatus,
} from "@/domain";
import {
  AccountAccessError,
  AdminWriteError,
  DatabaseReadError,
  NotAuthenticatedError,
  NotAuthorizedError,
  type ConsoleActor,
} from "@/ports";
import { getConsoleActor } from "@/lib/console-access";
import { MissingEnvironmentError } from "@/lib/env";
import { personName } from "@/lib/format";
import type { MemberFormState } from "./state";

/**
 * Deactivate and reactivate a member: a medtech (their org admin or a super
 * admin) or an org admin (a super admin only; admin/0009, 14zcqntkd0x).
 *
 * A deactivation is refused before anything changes when it would leave the
 * laboratory with no active org admin, or a patient with no active member; the
 * database function refuses the same.
 *
 * Two halves, in this order: the login's sign-in is blocked (or allowed) at the
 * auth provider, then the membership's status is recorded by an audited database
 * function. If the record fails, the sign-in change is undone, so the page never
 * shows someone as active who cannot sign in, or deactivated who still can.
 * Nothing is deleted either way (C8).
 */

const NOT_PERMITTED: MemberFormState = {
  error: "You cannot change this person's access.",
  done: null,
};
const SIGNED_OUT: MemberFormState = {
  error: "Your session has ended. Sign in again to manage people.",
  done: null,
};
const NOT_FOUND: MemberFormState = {
  error: "That person is no longer in this laboratory.",
  done: null,
};

function lastOrgAdmin(name: string): MemberFormState {
  return {
    error: `${name} is this laboratory's only active organization admin. Invite another first; to close the laboratory, deactivate the organization instead.`,
    done: null,
  };
}

function soleCoverError(name: string, patients: number | null): MemberFormState {
  const which =
    patients === null ? "some patients" : `${patients} patient${patients === 1 ? "" : "s"}`;
  return {
    error: `${name} is the only active member on ${which}. Hand them over first: ${name}'s page lists them.`,
    done: null,
  };
}

async function requireActor(): Promise<ConsoleActor | MemberFormState> {
  try {
    return await getConsoleActor();
  } catch (cause) {
    if (cause instanceof NotAuthenticatedError) return SIGNED_OUT;
    if (cause instanceof NotAuthorizedError) return NOT_PERMITTED;
    throw cause;
  }
}

export async function setMemberStatus(
  _previous: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const actor = await requireActor();
  if (!("user" in actor)) return actor;

  const submitted = String(formData.get("organizationId") ?? "");
  const organizationId =
    actor.access.kind === "org_admin" ? actor.access.organizationId : submitted;
  const userId = String(formData.get("userId") ?? "");
  if (!isUuid(organizationId) || !isUuid(userId)) return NOT_FOUND;
  const status: OrganizationStatus =
    formData.get("status") === "deactivated" ? "deactivated" : "active";

  let people;
  let soleCover: string[] = [];
  try {
    const db = await getDatabase();
    people = await db.listPeople(organizationId);
    if (status === "deactivated" && people.some((candidate) => candidate.userId === userId)) {
      soleCover = await db.listSoleCoverPatients(userId);
    }
  } catch (cause) {
    if (cause instanceof DatabaseReadError) return NOT_PERMITTED;
    if (cause instanceof MissingEnvironmentError) {
      return { error: `Server is not configured: ${cause.variable} is not set.`, done: null };
    }
    throw cause;
  }
  const person = people.find((candidate) => candidate.userId === userId);
  if (!person) return NOT_FOUND;
  if (!canChangeMemberStatus(actor.access, actor.user.id, organizationId, person)) {
    return NOT_PERMITTED;
  }

  const allowed = status === "active";
  const name = personName(person);
  // Checked before the sign-in is touched, so a refused deactivation changes nothing at all.
  if (!allowed && person.status === "active") {
    if (isLastActiveOrgAdmin(people, userId)) return lastOrgAdmin(name);
    if (soleCover.length > 0) return soleCoverError(name, soleCover.length);
  }
  // A profile whose login was deleted (app 0011) has nothing to block; only the record moves.
  if (person.accountId) {
    try {
      await (await getAccountAccess()).setSignInAllowed(person.accountId, allowed);
    } catch (cause) {
      if (cause instanceof AccountAccessError || cause instanceof MissingEnvironmentError) {
        console.error("Sign-in setting not changed", cause);
        return {
          error: `${name}'s sign-in could not be ${allowed ? "restored" : "blocked"}, so nothing changed. Try again.`,
          done: null,
        };
      }
      throw cause;
    }
  }

  try {
    await (await getAdminWrites()).setMemberStatus(userId, status);
  } catch (cause) {
    if (person.accountId) {
      await (
        await getAccountAccess()
      )
        .setSignInAllowed(person.accountId, !allowed)
        .catch((undo) => console.error("Sign-in change not undone", undo));
    }
    if (cause instanceof AdminWriteError) {
      // The database's own refusal, when something changed between the check above and now.
      if (cause.hint === "last_org_admin") return lastOrgAdmin(name);
      if (cause.hint === "sole_cover") return soleCoverError(name, null);
      return {
        error:
          cause.reason === "forbidden"
            ? NOT_PERMITTED.error
            : cause.reason === "not_found"
              ? NOT_FOUND.error
              : "The change could not be saved. Try again.",
        done: null,
      };
    }
    throw cause;
  }

  revalidatePath("/people");
  revalidatePath(`/people/${userId}`);
  revalidatePath(`/organizations/${organizationId}`);
  return {
    error: null,
    done: allowed
      ? `${name} can sign in again.`
      : `${name} is deactivated and can no longer sign in.`,
  };
}
