import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getAuth } from "@/adapters/registry";
import { isAllowed, type ConsoleAccessKind } from "@/domain/access";
import { NotAuthenticatedError, NotAuthorizedError, type ConsoleActor } from "@/ports/auth";
import { MissingEnvironmentError } from "@/lib/env";

/**
 * Server-side access checks for pages and route handlers.
 *
 * The `(dashboard)` layout resolves the actor once and turns a signed-out
 * visitor or a medtech away. A page that is narrower than "any console user"
 * calls {@link requirePageAccess} with the kinds it admits; hiding its sidebar
 * link is presentation, this call is the protection.
 *
 * `cache()` scopes the lookup to one request, so the layout and the page share a
 * single access lookup rather than paying for it twice.
 */
export const getConsoleActor = cache(async (): Promise<ConsoleActor> => {
  return (await getAuth()).requireConsoleActor();
});

/**
 * The actor, when their access kind is one this page admits. Anyone else gets a
 * 404: a page an org admin may not open is not a page that exists for them.
 *
 * On a client-side navigation the layout does not re-render, so this is the only
 * check that runs: a session that ended goes to `/login`, and access revoked
 * since the last click is a 404 rather than the error boundary.
 */
export async function requirePageAccess(
  allowed: readonly ConsoleAccessKind[],
): Promise<ConsoleActor> {
  let actor: ConsoleActor;
  try {
    actor = await getConsoleActor();
  } catch (cause) {
    if (cause instanceof NotAuthenticatedError) redirect("/login");
    if (cause instanceof NotAuthorizedError) notFound();
    throw cause;
  }
  if (!isAllowed(actor.access, allowed)) notFound();
  return actor;
}

/**
 * The same check for a route handler, which does not render inside the layout
 * and inherits nothing from it. Returns the actor, or the response to send.
 */
export async function requireRouteAccess(
  allowed: readonly ConsoleAccessKind[],
): Promise<{ actor: ConsoleActor } | { response: Response }> {
  try {
    const actor = await getConsoleActor();
    if (!isAllowed(actor.access, allowed)) {
      return { response: Response.json({ error: "Not permitted." }, { status: 403 }) };
    }
    return { actor };
  } catch (cause) {
    if (cause instanceof NotAuthenticatedError) {
      return { response: Response.json({ error: "Not authenticated." }, { status: 401 }) };
    }
    if (cause instanceof NotAuthorizedError) {
      return {
        response: Response.json({ error: "Administrator access required." }, { status: 403 }),
      };
    }
    if (cause instanceof MissingEnvironmentError) {
      return {
        response: Response.json(
          { error: `Server is not configured: ${cause.variable} is not set.` },
          { status: 503 },
        ),
      };
    }
    throw cause;
  }
}

/** Every kind of console user. */
export const ANY_CONSOLE_USER: readonly ConsoleAccessKind[] = ["super_admin", "org_admin"];
