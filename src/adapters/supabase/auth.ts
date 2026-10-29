import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveConsoleAccess, type OrgAdminMembership } from "@/domain/access";
import {
  secondFactorAdmits,
  secondFactorStep,
  type SecondFactorStep,
} from "@/domain/second-factor";
import {
  AuthUnavailableError,
  AuthenticationFailedError,
  HumanCheckFailedError,
  NotAuthenticatedError,
  NotAuthorizedError,
  PasswordChangeError,
  SecondFactorError,
  SecondFactorRequiredError,
  type AuthPort,
  type AuthenticatedUser,
  type ConsoleActor,
  type Credentials,
  type SecondFactorSetUp,
} from "@/ports/auth";
import { timed } from "@/lib/timing";
import { createRequestClient } from "./client";
import {
  humanCheckOptions,
  isFunctionNotFound,
  isHumanCheckRefusal,
  passwordChangeFailure,
  secondFactorFailure,
} from "./errors";

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
 * A read that fails is neither a refusal nor a grant: it throws
 * {@link AuthUnavailableError} (14zcqntk6h2), so an outage reads as an outage and not
 * as "no access". Only a read that succeeds and finds no grant and no membership is a
 * refusal. Either way, nobody gets in.
 *
 * 3. **Second step (14zcqntjnt0):** a console user's session must carry `aal2`, Supabase's
 *    mark that it passed an authenticator code — read from the same verified token, so it
 *    costs nothing. Short of that, {@link SecondFactorRequiredError}. Supabase answers a
 *    password sign-in with `aal1` and upgrades the session when a code is verified.
 *
 * A medtech is a refusal, not a downgrade. There is no partial console:
 * `requireConsoleActor()` throws rather than returning a reduced view, so a
 * caller cannot forget to branch on a role and leak a cross-user query.
 */

interface Identity {
  id: string;
  email: string | null;
  /** The verified token says this session passed an authenticator code (`aal2`). */
  secondFactorPassed: boolean;
}

/** The authenticator app's name in the provider, and the issuer the app shows beside the code. */
const AUTHENTICATOR_ISSUER = "AgarthaVision Admin";

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
    return {
      id: claims.sub,
      email: typeof claims.email === "string" ? claims.email : null,
      secondFactorPassed: claims.aal === "aal2",
    };
  }

  private async facts(userId: string): Promise<ActorFacts> {
    const { data, error } = await timed(
      "auth.actor",
      async () => await this.client.rpc("console_actor"),
    );
    // Before `admin/0010` is applied.
    if (error && isFunctionNotFound(error)) return this.factsWithoutActor(userId);
    // A failed read is not an answer. It grants nothing, and it is not "no access" either.
    if (error) throw new AuthUnavailableError(error);
    // A read that found no row is no access at all.
    const row = (data as ConsoleActorRow[] | null)?.[0] ?? null;
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
   * A failed `is_admin()` call or membership read throws, as a failed `console_actor()`
   * does; a failed profile read only loses the name.
   */
  private async factsWithoutActor(userId: string): Promise<ActorFacts> {
    const [profile, superAdmin] = await Promise.all([
      this.client.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
      this.client.rpc("is_admin", { user_id: userId }),
    ]);
    if (superAdmin.error) throw new AuthUnavailableError(superAdmin.error);
    const name = profile.error ? null : (profile.data as ProfileNameRow | null);
    const isSuperAdmin = superAdmin.data === true;
    if (isSuperAdmin) return { fullName: name?.full_name ?? null, isSuperAdmin, membership: null };

    const { data, error } = await this.client
      .from("organization_members")
      .select("organization_id, role, status, organizations ( name, status )")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new AuthUnavailableError(error);
    const row = data ? (data as unknown as MembershipRow) : null;
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
    identity: Pick<Identity, "id" | "email">,
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
    // Access first, so a medtech is told where to go and never asked for a code.
    const actor = this.toActor(user, facts);
    // A passed session costs nothing more. Short of it, only an account with an app is held
    // back (14zcqntr31c), and whether it has one is asked of the auth server, never the cookie.
    if (identity.secondFactorPassed) return actor;
    const step = secondFactorStep({
      sessionPassed: false,
      hasAuthenticator: (await this.confirmedAuthenticator()) !== null,
    });
    if (!secondFactorAdmits(step)) throw new SecondFactorRequiredError(actor);
    return actor;
  }

  async secondFactorStatus(): Promise<{
    actor: ConsoleActor;
    step: SecondFactorStep;
    hasAuthenticator: boolean;
  }> {
    const identity = await this.identity();
    if (!identity) throw new NotAuthenticatedError();
    const { user, facts } = await this.userFor(identity);
    const actor = this.toActor(user, facts);
    const hasAuthenticator = (await this.confirmedAuthenticator()) !== null;
    const step = secondFactorStep({ sessionPassed: identity.secondFactorPassed, hasAuthenticator });
    return { actor, step, hasAuthenticator };
  }

  /**
   * The account's confirmed authenticator app, or null. Asks the auth server (`getUser`), not
   * the cookie, which only says what the browser claims.
   */
  private async confirmedAuthenticator(): Promise<string | null> {
    const { data, error } = await timed("auth.factors", () => this.client.auth.mfa.listFactors());
    if (error) throw new AuthUnavailableError(error);
    return data.totp[0]?.id ?? null;
  }

  async beginSecondFactorSetUp(): Promise<SecondFactorSetUp> {
    // An abandoned set-up (the page closed before the first code) is never confirmed; clear it
    // so set-ups do not pile up against the provider's limit. Unconfirmed ones only: removing a
    // confirmed app needs a session that already passed the step.
    const listed = await this.client.auth.mfa.listFactors();
    if (listed.error) throw new SecondFactorError(secondFactorFailure(listed.error), listed.error);
    for (const factor of listed.data.all) {
      if (factor.factor_type === "totp" && factor.status === "unverified") {
        await this.client.auth.mfa.unenroll({ factorId: factor.id });
      }
    }

    const { data, error } = await this.client.auth.mfa.enroll({
      factorType: "totp",
      issuer: AUTHENTICATOR_ISSUER,
      // Unique, because the provider refuses a second set-up under a name already in use.
      friendlyName: `${AUTHENTICATOR_ISSUER} ${new Date().toISOString()}`,
    });
    // Refused outright when an app is already confirmed and this session has not passed it.
    if (error) throw new SecondFactorError(secondFactorFailure(error), error);
    return { setUpId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
  }

  async confirmSecondFactorSetUp(setUpId: string, code: string): Promise<void> {
    await this.verify(setUpId, code);
  }

  async verifySecondFactor(code: string): Promise<void> {
    const factorId = await this.confirmedAuthenticator();
    if (!factorId) throw new SecondFactorError("failed");
    await this.verify(factorId, code);
  }

  async turnOffSecondFactor(code: string): Promise<void> {
    const factorId = await this.confirmedAuthenticator();
    if (!factorId) throw new SecondFactorError("failed");
    await this.verify(factorId, code);
    // The provider needs an `aal2` session to remove a confirmed app; the code just entered
    // makes sure this one is. It then lowers the account's sessions to `aal1`.
    const { error } = await this.client.auth.mfa.unenroll({ factorId });
    if (error) throw new SecondFactorError(secondFactorFailure(error), error);
  }

  /**
   * One challenge and its code. On success the provider upgrades this session to `aal2` and the
   * request client writes the new session cookies. The provider also ends the account's other
   * sessions that have not passed a code — a phone signed in to the app with only a password.
   */
  private async verify(factorId: string, code: string): Promise<void> {
    const { error } = await this.client.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) throw new SecondFactorError(secondFactorFailure(error), error);
  }

  async signInWithPassword({
    email,
    password,
    humanCheckToken,
  }: Credentials): Promise<ConsoleActor> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password,
      options: humanCheckOptions(humanCheckToken),
    });
    if (isHumanCheckRefusal(error)) throw new HumanCheckFailedError(error);
    if (error || !data.user) throw new AuthenticationFailedError(error);
    // The client now carries the new session, so console_actor() answers about this user.
    const { user, facts } = await this.userFor({
      id: data.user.id,
      email: data.user.email ?? null,
    });
    return this.toActor(user, facts);
  }

  /**
   * One request: Supabase Auth checks the current password and the rules, sets the new one, and
   * ends the account's other sessions in the same transaction, keeping this one. It checks the
   * current password only with "Require current password when changing password" on (Supabase
   * Auth's `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD`; see Supabase's "Password
   * security" guide). Without it the field is ignored, so that setting is required.
   * An account with an authenticator app needs an `aal2` session, which the console gate
   * already ensures.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({
      password: newPassword,
      current_password: currentPassword,
    });
    if (error) throw new PasswordChangeError(passwordChangeFailure(error), error);
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }
}

/** Builds the adapter against a request-scoped, session-carrying client. */
export async function createSupabaseAuth(): Promise<AuthPort> {
  return new SupabaseAuthAdapter(await createRequestClient());
}
