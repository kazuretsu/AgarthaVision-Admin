import { readScopeFor, type ReadScope } from "@/domain";
import type { ConsoleActor } from "@/ports/auth";
import { getConsoleActor } from "./console-access";

/**
 * The signed-in actor and the scope their reads run in. `requested` is the
 * `org` query parameter; only a super admin's request can narrow anything, and
 * an org admin is held to their own organization whatever it says.
 */
export async function scopeForRequest(
  requested?: string | string[] | null,
): Promise<{ actor: ConsoleActor; scope: ReadScope }> {
  const actor = await getConsoleActor();
  const value = Array.isArray(requested) ? requested[0] : requested;
  return { actor, scope: readScopeFor(actor.access, value) };
}
