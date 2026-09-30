import type { SupabaseClient, User } from "@supabase/supabase-js";
import { resolveConsoleAccess, type OrgAdminMembership } from "@/domain/access";
import {
  AuthenticationFailedError,
  NotAuthenticatedError,
  NotAuthorizedError,
  type AuthPort,
  type AuthenticatedUser,
  type ConsoleActor,
  type Credentials,
  type UserRole,
} from "@/ports/auth";
import { createRequestClient } from "./client";

/**
 * Supabase Auth implementation of {@link AuthPort}.
 *
 * Identity comes from Supabase Auth; access does not. `profiles.role` decides
 * who is a super admin, and an active org-admin membership decides who is an org
 * admin — never a JWT claim, never `user_metadata`, both of which a user can
 * influence. The lookups cost a round trip per request and are worth it.
 *
 * A medtech is a refusal, not a downgrade. There is no partial console:
 * `requireConsoleActor()` throws rather than returning a reduced view, so a
 * caller cannot forget to branch on a role and leak a cross-user query.
 */

interface ProfileRoleRow {
  full_name: string | null;
  role: string | null;
}

/**
 * `profiles.role` is `text` with a CHECK, not a Postgres enum, so an unexpected
 * value is possible in principle. Anything that is not exactly `admin` resolves
 * to the lesser privilege.
 */
function toRole(value: string | null | undefined): UserRole {
  return value === "admin" ? "admin" : "medtech";
}

export class SupabaseAuthAdapter implements AuthPort {
  constructor(private readonly client: SupabaseClient) {}

  private async toAuthenticatedUser(user: User): Promise<AuthenticatedUser> {
    const { data, error } = await this.client
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .maybeSingle();

    // A missing or unreadable profile is not an admin. `0001_init.sql` creates
    // the row via handle_new_user(), so absence means something is wrong
    // upstream — and the safe reading of "wrong" is the lesser privilege.
    const profile = error ? null : (data as ProfileRoleRow | null);

    return {
      id: user.id,
      email: user.email ?? null,
      fullName: profile?.full_name ?? null,
      role: toRole(profile?.role),
    };
  }

  /**
   * The user's active org-admin membership. Organizations do not exist yet, so
   * nobody is an org admin; the organizations ticket reads the membership here
   * and nothing else in the gate changes.
   */
  private async findOrgAdminMembership(): Promise<OrgAdminMembership | null> {
    return null;
  }

  private async toActor(user: AuthenticatedUser): Promise<ConsoleActor> {
    // A super admin needs no membership lookup; skip the round trip.
    const membership = user.role === "admin" ? null : await this.findOrgAdminMembership();
    const access = resolveConsoleAccess(user.role, membership);
    if (!access) throw new NotAuthorizedError(user);
    return { user, access };
  }

  async getCurrentUser(): Promise<AuthenticatedUser | null> {
    // getUser() revalidates against the auth server. getSession() would only
    // decode the cookie, which the browser can set — never trust it for a
    // privilege decision.
    const { data, error } = await this.client.auth.getUser();
    if (error || !data.user) return null;
    return this.toAuthenticatedUser(data.user);
  }

  async requireConsoleActor(): Promise<ConsoleActor> {
    const user = await this.getCurrentUser();
    if (!user) throw new NotAuthenticatedError();
    return this.toActor(user);
  }

  async signInWithPassword({ email, password }: Credentials): Promise<ConsoleActor> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw new AuthenticationFailedError(error);
    return this.toActor(await this.toAuthenticatedUser(data.user));
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }
}

/** Builds the adapter against a request-scoped, session-carrying client. */
export async function createSupabaseAuth(): Promise<AuthPort> {
  return new SupabaseAuthAdapter(await createRequestClient());
}
