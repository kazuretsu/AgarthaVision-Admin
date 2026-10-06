import type { SupabaseClient } from "@supabase/supabase-js";
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
import { timed } from "@/lib/timing";
import { createRequestClient } from "./client";

/**
 * Supabase Auth implementation of {@link AuthPort}.
 *
 * Identity comes from Supabase Auth; access does not. An active grant in
 * `super_admins`, read through `is_admin()`, decides who is a super admin, and an
 * active org-admin membership decides who is an org admin — never a JWT claim, never
 * `user_metadata`, both of which a user can influence, and never the retired
 * `profiles.role`.
 *
 * Every page re-checks, so a revoked admin is locked out on their next click
 * (14zcqntkd0y keeps that and makes it cheap):
 *
 * 1. **Who:** `getClaims()` verifies the session's JWT against the project's
 *    published signing key (ECC P-256), locally once the key is cached — no auth-server
 *    round trip. A legacy shared-secret project falls back to asking the server.
 * 2. **What they may do:** `console_actor()` (`admin/0010`) returns the name, the
 *    super-admin grant and the membership in **one** call. If that function is not
 *    installed yet, the three reads it replaces run instead, so a deployment that
 *    ships before its migration is applied keeps working.
 *
 * A medtech is a refusal, not a downgrade. There is no partial console:
 * `requireConsoleActor()` throws rather than returning a reduced view, so a
 * caller cannot forget to branch on a role and leak a cross-user query.
 */

interface Identity {
  id: string;
  email: string | null;
}

/** What the gate needs about the caller, however it was read. */
interface ActorFacts {
  fullName: string | null;
  isSuperAdmin: boolean;
  membership: OrgAdminMembership | null;
}

interface ConsoleActorRow {
  full_name: string | null;
  is_super_admin: boolean | null;
  organization_id: string | null;
  organization_name: string | null;
  member_role: string | null;
  member_status: string | null;
  organization_status: string | null;
}

interface MembershipRow {
  organization_id: string;
  role: string;
  status: string;
  organizations: { name: string; status: string } | null;
}

interface ProfileNameRow {
  full_name: string | null;
}

/** PostgREST's "no such function", when `admin/0010` has not been applied yet. */
const FUNCTION_NOT_FOUND = new Set(["PGRST202", "42883"]);

/**
 * An org-admin membership only when it is `org_admin`, active, in an active
 * organization. Anything else is no membership — the lesser privilege.
 */
function orgAdminMembership(
  organizationId: string | null,
  organizationName: string | null,
  role: string | null,
  status: string | null,
  organizationStatus: string | null,
): OrgAdminMembership | null {
  if (!organizationId || !organizationName) return null;
  if (role !== "org_admin" || status !== "active" || organizationStatus !== "active") return null;
  return { organizationId, organizationName };
}

export class SupabaseAuthAdapter implements AuthPort {
  constructor(private readonly client: SupabaseClient) {}

  /** The verified caller, or null when there is no valid session. */
  private async identity(): Promise<Identity | null> {
    // getClaims() verifies the JWT's signature and expiry. getSession() would only decode
    // the cookie, which the browser can set — never trust it for a privilege decision.
    const { data, error } = await timed("auth.claims", () => this.client.auth.getClaims());
    const claims = data?.claims;
    if (error || !claims || typeof claims.sub !== "string") return null;
    return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
  }

  private async facts(userId: string): Promise<ActorFacts> {
    const { data, error } = await timed(
      "auth.actor",
      async () => await this.client.rpc("console_actor"),
    );
    if (error && FUNCTION_NOT_FOUND.has(error.code ?? "")) return this.factsWithoutActor(userId);
    // Anything unreadable is no access at all — the lesser privilege.
    const row = error ? null : ((data as ConsoleActorRow[] | null)?.[0] ?? null);
    if (!row) return { fullName: null, isSuperAdmin: false, membership: null };
    return {
      fullName: row.full_name,
      isSuperAdmin: row.is_super_admin === true,
      membership: orgAdminMembership(
        row.organization_id,
        row.organization_name,
        row.member_role,
        row.member_status,
        row.organization_status,
      ),
    };
  }

  /**
   * The three reads `console_actor()` replaces, for a database without `admin/0010`.
   * `is_admin()` is the check every policy makes; anything but an explicit `true` is
   * no grant. RLS lets every user read their own profile, membership and organization.
   */
  private async factsWithoutActor(userId: string): Promise<ActorFacts> {
    const [profile, superAdmin] = await Promise.all([
      this.client.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
      this.client.rpc("is_admin", { user_id: userId }),
    ]);
    const name = profile.error ? null : (profile.data as ProfileNameRow | null);
    const isSuperAdmin = !superAdmin.error && superAdmin.data === true;
    if (isSuperAdmin) return { fullName: name?.full_name ?? null, isSuperAdmin, membership: null };

    const { data, error } = await this.client
      .from("organization_members")
      .select("organization_id, role, status, organizations ( name, status )")
      .eq("user_id", userId)
      .maybeSingle();
    const row = error || !data ? null : (data as unknown as MembershipRow);
    return {
      fullName: name?.full_name ?? null,
      isSuperAdmin,
      membership: row
        ? orgAdminMembership(
            row.organization_id,
            row.organizations?.name ?? null,
            row.role,
            row.status,
            row.organizations?.status ?? null,
          )
        : null,
    };
  }

  private async userFor(
    identity: Identity,
  ): Promise<{ user: AuthenticatedUser; facts: ActorFacts }> {
    const facts = await this.facts(identity.id);
    return {
      user: {
        id: identity.id,
        email: identity.email,
        fullName: facts.fullName,
        isSuperAdmin: facts.isSuperAdmin,
      },
      facts,
    };
  }

  private toActor(user: AuthenticatedUser, facts: ActorFacts): ConsoleActor {
    const access = resolveConsoleAccess(facts.isSuperAdmin, facts.membership);
    if (!access) throw new NotAuthorizedError(user);
    return { user, access };
  }

  async getCurrentUser(): Promise<AuthenticatedUser | null> {
    const identity = await this.identity();
    return identity ? (await this.userFor(identity)).user : null;
  }

  async requireConsoleActor(): Promise<ConsoleActor> {
    const identity = await this.identity();
    if (!identity) throw new NotAuthenticatedError();
    const { user, facts } = await this.userFor(identity);
    return this.toActor(user, facts);
  }

  async signInWithPassword({ email, password }: Credentials): Promise<ConsoleActor> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw new AuthenticationFailedError(error);
    // The client now carries the new session, so console_actor() answers about this user.
    const { user, facts } = await this.userFor({
      id: data.user.id,
      email: data.user.email ?? null,
    });
    return this.toActor(user, facts);
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }
}

/** Builds the adapter against a request-scoped, session-carrying client. */
export async function createSupabaseAuth(): Promise<AuthPort> {
  return new SupabaseAuthAdapter(await createRequestClient());
}
