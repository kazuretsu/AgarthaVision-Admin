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
} from "@/ports/auth";
import { createRequestClient } from "./client";

/**
 * Supabase Auth implementation of {@link AuthPort}.
 *
 * Identity comes from Supabase Auth; access does not. An active grant in
 * `super_admins`, read through `is_admin()`, decides who is a super admin, and an
 * active org-admin membership decides who is an org admin — never a JWT claim, never
 * `user_metadata`, both of which a user can influence, and never the retired
 * `profiles.role`. The lookups cost a round trip per request and are worth it.
 *
 * A medtech is a refusal, not a downgrade. There is no partial console:
 * `requireConsoleActor()` throws rather than returning a reduced view, so a
 * caller cannot forget to branch on a role and leak a cross-user query.
 */

interface MembershipRow {
  organization_id: string;
  role: string;
  status: string;
  organizations: { name: string; status: string } | null;
}

interface ProfileNameRow {
  full_name: string | null;
}

export class SupabaseAuthAdapter implements AuthPort {
  constructor(private readonly client: SupabaseClient) {}

  private async toAuthenticatedUser(user: User): Promise<AuthenticatedUser> {
    const [profile, superAdmin] = await Promise.all([
      this.client.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      this.isSuperAdmin(user.id),
    ]);
    const name = profile.error ? null : (profile.data as ProfileNameRow | null);

    return {
      id: user.id,
      email: user.email ?? null,
      fullName: name?.full_name ?? null,
      isSuperAdmin: superAdmin,
    };
  }

  /**
   * `is_admin()` (app `0014`) is the check every database policy makes, so the console
   * and the database never disagree about who is a super admin. `super_admins` itself
   * is closed to every client; this security definer function is the one way to ask.
   * Anything but an explicit `true` — an error, a null — is the lesser privilege.
   */
  private async isSuperAdmin(userId: string): Promise<boolean> {
    const { data, error } = await this.client.rpc("is_admin", { user_id: userId });
    return !error && data === true;
  }

  /**
   * The user's active org-admin membership in an active organization
   * (`admin/0001`). RLS lets every user read their own membership row and their
   * own organization. Anything unreadable, inactive or not `org_admin` is no
   * membership — the lesser privilege.
   */
  private async findOrgAdminMembership(userId: string): Promise<OrgAdminMembership | null> {
    const { data, error } = await this.client
      .from("organization_members")
      .select("organization_id, role, status, organizations ( name, status )")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) return null;
    const row = data as unknown as MembershipRow;
    if (row.role !== "org_admin" || row.status !== "active") return null;
    if (!row.organizations || row.organizations.status !== "active") return null;
    return { organizationId: row.organization_id, organizationName: row.organizations.name };
  }

  private async toActor(user: AuthenticatedUser): Promise<ConsoleActor> {
    // A super admin needs no membership lookup; skip the round trip.
    const membership = user.isSuperAdmin ? null : await this.findOrgAdminMembership(user.id);
    const access = resolveConsoleAccess(user.isSuperAdmin, membership);
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
