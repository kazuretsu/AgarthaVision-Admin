import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  AuthenticationFailedError,
  NotAuthenticatedError,
  NotAuthorizedError,
  type AuthPort,
  type AuthenticatedUser,
  type Credentials,
  type UserRole,
} from "@/ports/auth";
import { createRequestClient } from "./client";

/**
 * Supabase Auth implementation of {@link AuthPort}.
 *
 * Identity comes from Supabase Auth; the role does not. `profiles.role` is the
 * only authority on whether someone is an admin — never a JWT claim, never user
 * metadata, both of which are shaped by data the user can influence at signup.
 * The lookup costs one extra round trip per request and is worth it.
 *
 * The medtech case is a refusal, not a downgrade. There is no partial console:
 * `requireAdmin()` throws rather than returning a reduced view, so a caller
 * cannot forget to branch on a role and leak a cross-user query.
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

  async getCurrentUser(): Promise<AuthenticatedUser | null> {
    // getUser() revalidates against the auth server. getSession() would only
    // decode the cookie, which the browser can set — never trust it for a
    // privilege decision.
    const { data, error } = await this.client.auth.getUser();
    if (error || !data.user) return null;
    return this.toAuthenticatedUser(data.user);
  }

  async requireAdmin(): Promise<AuthenticatedUser> {
    const user = await this.getCurrentUser();
    if (!user) throw new NotAuthenticatedError();
    if (user.role !== "admin") throw new NotAuthorizedError(user.role);
    return user;
  }

  async signInWithPassword({ email, password }: Credentials): Promise<AuthenticatedUser> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw new AuthenticationFailedError(error);
    return this.toAuthenticatedUser(data.user);
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }
}

/** Builds the adapter against a request-scoped, session-carrying client. */
export async function createSupabaseAuth(): Promise<AuthPort> {
  return new SupabaseAuthAdapter(await createRequestClient());
}
