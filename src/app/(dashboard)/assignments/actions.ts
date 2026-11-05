"use server";

import { revalidatePath } from "next/cache";
import { getAdminWrites, getDatabase } from "@/adapters/registry";
import { assignableMembers, canAssignPatients, canRemoveAssignment, isUuid } from "@/domain";
import {
  AdminWriteError,
  DatabaseReadError,
  NotAuthenticatedError,
  NotAuthorizedError,
  type ConsoleActor,
} from "@/ports";
import { getConsoleActor } from "@/lib/console-access";
import { MissingEnvironmentError } from "@/lib/env";
import { personName } from "@/lib/format";
import type { AssignmentFormState } from "./state";

/**
 * Assign, remove and hand over a patient. Org admins only, for their own
 * laboratory's patients and its active members, org admins included. Each checks
 * the rule here first (D7); the database function checks again and writes the
 * audit row. Removing an assignment removes access only: the patient and every
 * record stay.
 */

const NOT_PERMITTED: AssignmentFormState = {
  error: "Only this laboratory's organization admin can change who is assigned.",
  done: null,
};
const SIGNED_OUT: AssignmentFormState = {
  error: "Your session has ended. Sign in again to change assignments.",
  done: null,
};
const NOT_FOUND: AssignmentFormState = {
  error: "That patient or person is not in this laboratory.",
  done: null,
};
const LAST =
  "A patient always keeps at least one active member of the laboratory. Choose who takes over instead.";

type Actor = ConsoleActor & {
  access: { kind: "org_admin"; organizationId: string; organizationName: string };
};

async function requireAssigner(): Promise<Actor | AssignmentFormState> {
  let actor: ConsoleActor;
  try {
    actor = await getConsoleActor();
  } catch (cause) {
    if (cause instanceof NotAuthenticatedError) return SIGNED_OUT;
    if (cause instanceof NotAuthorizedError) return NOT_PERMITTED;
    throw cause;
  }
  return canAssignPatients(actor.access) ? (actor as Actor) : NOT_PERMITTED;
}

function explain(cause: unknown): AssignmentFormState {
  if (cause instanceof AdminWriteError) {
    if (cause.hint === "last_assignment") return { error: LAST, done: null };
    const messages = {
      forbidden: "That person cannot be assigned to this patient.",
      not_found: "That assignment no longer exists.",
      conflict: "That changed in the meantime. Reload and try again.",
      invalid: "Choose a different person.",
      failed: "The change could not be saved. Try again.",
    } as const;
    return { error: messages[cause.reason], done: null };
  }
  if (cause instanceof DatabaseReadError) return NOT_FOUND;
  if (cause instanceof MissingEnvironmentError) {
    return { error: `Server is not configured: ${cause.variable} is not set.`, done: null };
  }
  throw cause;
}

function ids(formData: FormData, ...names: string[]): string[] | null {
  const values = names.map((name) => String(formData.get(name) ?? ""));
  return values.every(isUuid) ? values : null;
}

function refresh(patientId: string, ...userIds: string[]) {
  revalidatePath(`/records/patients/${patientId}`);
  revalidatePath("/people");
  for (const userId of userIds) revalidatePath(`/people/${userId}`);
}

/** The person, when they are an active member of this laboratory not yet assigned. */
async function assignable(actor: Actor, patientId: string, userId: string) {
  const db = await getDatabase();
  const [people, assignments] = await Promise.all([
    db.listPeople(actor.access.organizationId),
    db.listPatientAssignments(patientId),
  ]);
  return assignableMembers(people, assignments).find((person) => person.userId === userId);
}

export async function assignPatient(
  _previous: AssignmentFormState,
  formData: FormData,
): Promise<AssignmentFormState> {
  const actor = await requireAssigner();
  if (!("user" in actor)) return actor;
  const values = ids(formData, "patientId", "userId");
  if (!values) return { error: "Choose someone to assign.", done: null };
  const [patientId, userId] = values;

  let person;
  try {
    person = await assignable(actor, patientId, userId);
    if (!person) return NOT_FOUND;
    await (await getAdminWrites()).assignPatient(patientId, userId);
  } catch (cause) {
    return explain(cause);
  }
  refresh(patientId, userId);
  return {
    error: null,
    done: `Assigned to ${personName(person)}. They see this patient after their next sync.`,
  };
}

export async function unassignPatient(
  _previous: AssignmentFormState,
  formData: FormData,
): Promise<AssignmentFormState> {
  const actor = await requireAssigner();
  if (!("user" in actor)) return actor;
  const values = ids(formData, "patientId", "userId");
  if (!values) return NOT_FOUND;
  const [patientId, userId] = values;

  try {
    const assignments = await (await getDatabase()).listPatientAssignments(patientId);
    if (!assignments.some((assignment) => assignment.userId === userId)) {
      return { error: "That assignment no longer exists.", done: null };
    }
    if (!canRemoveAssignment(assignments, userId)) return { error: LAST, done: null };
    await (await getAdminWrites()).unassignPatient(patientId, userId);
  } catch (cause) {
    return explain(cause);
  }
  refresh(patientId, userId);
  return { error: null, done: "Assignment removed. Nothing else changed." };
}

export async function replaceAssignment(
  _previous: AssignmentFormState,
  formData: FormData,
): Promise<AssignmentFormState> {
  const actor = await requireAssigner();
  if (!("user" in actor)) return actor;
  const values = ids(formData, "patientId", "fromUserId", "userId");
  if (!values) return { error: "Choose who takes over.", done: null };
  const [patientId, fromUserId, toUserId] = values;

  let person;
  try {
    person = await assignable(actor, patientId, toUserId);
    if (!person) return NOT_FOUND;
    await (await getAdminWrites()).replaceAssignment(patientId, fromUserId, toUserId);
  } catch (cause) {
    return explain(cause);
  }
  refresh(patientId, fromUserId, toUserId);
  return { error: null, done: `Handed over to ${personName(person)}.` };
}
