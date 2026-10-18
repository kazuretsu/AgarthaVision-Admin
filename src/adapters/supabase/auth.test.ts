import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  AuthUnavailableError,
  AuthenticationFailedError,
  HumanCheckFailedError,
  NotAuthenticatedError,
  NotAuthorizedError,
  SecondFactorError,
  SecondFactorRequiredError,
} from "@/ports/auth";
import { SupabaseAuthAdapter } from "./auth";

vi.spyOn(console, "info").mockImplementation(() => {});

const USER_ID = "00000000-0000-4000-8000-000000000001";

interface Answers {
  /** The verified session's claims, or none. */
  claims?: Record<string, unknown> | null;
  /** What `console_actor()` returns: its row, or an error. */
  actor?: { data: unknown; error: unknown };
  /** The fallback reads, for a database without `admin/0010`. */
  isAdmin?: { data: unknown; error: unknown };
  profile?: Record<string, unknown> | null;
  membership?: Record<string, unknown> | null;
  /** The membership read's error, when it fails. */
  membershipError?: unknown;
  /** The account's authenticator factors, as `mfa.listFactors()` returns them, or its error. */
  factors?: { data: unknown; error: unknown };
  /** What `mfa.enroll()` returns. */
  enroll?: { data: unknown; error: unknown };
  /** What `mfa.challengeAndVerify()` returns. */
  verify?: { error: unknown };
}

/** A client that answers the gate and records every auth call, RPC and table read. */
function gateClient(answers: Answers) {
  const calls: string[] = [];
  const selects: Record<string, string> = {};
  const client = {
    auth: {
      getClaims: () => {
        calls.push("auth.getClaims");
        // By default a session that passed the authenticator code (14zcqntjnt0).
        const claims =
          answers.claims === undefined
            ? { sub: USER_ID, email: "a@example.test", aal: "aal2" }
            : answers.claims;
        return Promise.resolve({ data: claims ? { claims } : null, error: null });
      },
      getUser: () => {
        calls.push("auth.getUser");
        return Promise.resolve({ data: { user: { id: USER_ID } }, error: null });
      },
      mfa: {
        listFactors: () => {
          calls.push("mfa.listFactors");
          return Promise.resolve(answers.factors);
        },
        unenroll: ({ factorId }: { factorId: string }) => {
          calls.push(`mfa.unenroll.${factorId}`);
          return Promise.resolve({ data: { id: factorId }, error: null });
        },
        enroll: (params: Record<string, unknown>) => {
          calls.push(`mfa.enroll.${String(params.factorType)}.${String(params.issuer)}`);
          return Promise.resolve(answers.enroll);
        },
        challengeAndVerify: ({ factorId, code }: { factorId: string; code: string }) => {
          calls.push(`mfa.verify.${factorId}.${code}`);
          return Promise.resolve(answers.verify ?? { error: null });
        },
      },
    },
    rpc(name: string) {
      calls.push(`rpc.${name}`);
      if (name === "console_actor") return Promise.resolve(answers.actor);
      return Promise.resolve(answers.isAdmin);
    },
    from(table: string) {
      calls.push(`from.${table}`);
      const builder: Record<string, unknown> = {
        select(columns: string) {
          selects[table] = columns;
          return builder;
        },
        eq: () => builder,
        maybeSingle: () =>
          Promise.resolve({
            data: table === "profiles" ? (answers.profile ?? null) : (answers.membership ?? null),
            error: table === "profiles" ? null : (answers.membershipError ?? null),
          }),
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls, selects };
}

const row = (overrides: Record<string, unknown>) => ({
  data: [
    {
      full_name: "Ana",
      is_super_admin: false,
      organization_id: null,
      organization_name: null,
      member_role: null,
      member_status: null,
      organization_status: null,
      ...overrides,
    },
  ],
  error: null,
});

const orgAdmin = {
  organization_id: "org-1",
  organization_name: "Lab One",
  member_role: "org_admin",
  member_status: "active",
  organization_status: "active",
};

describe("SupabaseAuthAdapter — one cheap check per page (14zcqntkd0y)", () => {
  it("verifies the session locally and asks console_actor() once: nothing else", async () => {
    const { client, calls } = gateClient({ actor: row({ is_super_admin: true }) });
    await new SupabaseAuthAdapter(client).requireConsoleActor();
    expect(calls).toEqual(["auth.getClaims", "rpc.console_actor"]);
  });

  it("refuses with no valid session, before reading anything", async () => {
    const { client, calls } = gateClient({ claims: null });
    await expect(new SupabaseAuthAdapter(client).requireConsoleActor()).rejects.toBeInstanceOf(
      NotAuthenticatedError,
    );
    expect(calls).toEqual(["auth.getClaims"]);
  });
});

describe("SupabaseAuthAdapter — who gets in (D22)", () => {
  it("an active super-admin grant is a super admin", async () => {
    const { client } = gateClient({ actor: row({ is_super_admin: true }) });
    const actor = await new SupabaseAuthAdapter(client).requireConsoleActor();
    expect(actor.access).toEqual({ kind: "super_admin" });
    expect(actor.user).toMatchObject({ id: USER_ID, fullName: "Ana", isSuperAdmin: true });
  });

  it("an active org-admin membership in an active organization is an org admin", async () => {
    const { client } = gateClient({ actor: row(orgAdmin) });
    const actor = await new SupabaseAuthAdapter(client).requireConsoleActor();
    expect(actor.access).toEqual({
      kind: "org_admin",
      organizationId: "org-1",
      organizationName: "Lab One",
    });
  });

  it.each([
    ["a deactivated membership", { ...orgAdmin, member_status: "deactivated" }],
    ["a deactivated organization", { ...orgAdmin, organization_status: "deactivated" }],
    ["a medtech", { ...orgAdmin, member_role: "medtech" }],
    ["no membership and no grant", {}],
  ])("refuses %s", async (_case, overrides) => {
    const { client } = gateClient({ actor: row(overrides) });
    await expect(new SupabaseAuthAdapter(client).requireConsoleActor()).rejects.toBeInstanceOf(
      NotAuthorizedError,
    );
  });
});

describe("SupabaseAuthAdapter — a failed read is not a refusal (14zcqntk6h2)", () => {
  it.each([
    ["a timeout", { code: "57014", message: "canceling statement due to statement timeout" }],
    ["PostgREST unreachable", { code: "", message: "TypeError: fetch failed" }],
    ["a gateway error", { code: "PGRST000", message: "Database connection error" }],
  ])("a console_actor() call that fails with %s is unavailable, not no access", async (_c, e) => {
    const { client } = gateClient({ actor: { data: null, error: e } });
    const refusal = new SupabaseAuthAdapter(client).requireConsoleActor();
    await expect(refusal).rejects.toBeInstanceOf(AuthUnavailableError);
    await expect(refusal).rejects.toMatchObject({ cause: e });
  });

  it("the caller of an unavailable read gets no actor and no access", async () => {
    const { client } = gateClient({ actor: { data: null, error: { code: "57014" } } });
    const result = await new SupabaseAuthAdapter(client).requireConsoleActor().catch((e) => e);
    expect(result).not.toBeInstanceOf(NotAuthorizedError);
    expect(result).not.toHaveProperty("access");
  });

  it("a console_actor() call that answers with no row is still no access", async () => {
    const { client } = gateClient({ actor: { data: [], error: null } });
    await expect(new SupabaseAuthAdapter(client).requireConsoleActor()).rejects.toBeInstanceOf(
      NotAuthorizedError,
    );
  });

  it("sign-in with the right password but unreadable access is unavailable", async () => {
    const { client } = gateClient({ actor: { data: null, error: { code: "57014" } } });
    Object.assign(client.auth, {
      signInWithPassword: () =>
        Promise.resolve({ data: { user: { id: USER_ID, email: "a@example.test" } }, error: null }),
    });
    await expect(
      new SupabaseAuthAdapter(client).signInWithPassword({
        email: "a@example.test",
        password: "x",
      }),
    ).rejects.toBeInstanceOf(AuthUnavailableError);
  });
});

describe("SupabaseAuthAdapter — before admin/0010 is applied", () => {
  const missing = { data: null, error: { code: "PGRST202" } };

  it("falls back to the three reads, asks is_admin() and never reads profiles.role", async () => {
    const { client, calls, selects } = gateClient({
      actor: missing,
      isAdmin: { data: true, error: null },
      profile: { full_name: "Ana", role: "medtech" },
    });
    const actor = await new SupabaseAuthAdapter(client).requireConsoleActor();
    expect(actor.access).toEqual({ kind: "super_admin" });
    expect(calls).toContain("rpc.is_admin");
    expect(selects.profiles).not.toMatch(/\brole\b/);
  });

  it("still lets an org admin in through their membership", async () => {
    const membership = {
      organization_id: "org-1",
      role: "org_admin",
      status: "active",
      organizations: { name: "Lab One", status: "active" },
    };
    const ok = gateClient({
      actor: missing,
      isAdmin: { data: false, error: null },
      profile: { full_name: "Cy" },
      membership,
    });
    expect((await new SupabaseAuthAdapter(ok.client).requireConsoleActor()).access).toEqual({
      kind: "org_admin",
      organizationId: "org-1",
      organizationName: "Lab One",
    });
  });

  it("a failed is_admin() call is unavailable, never a grant (14zcqntk6h2)", async () => {
    const { client, calls } = gateClient({
      actor: missing,
      isAdmin: { data: null, error: { message: "boom" } },
      profile: { full_name: "Ben", role: "admin" },
    });
    await expect(new SupabaseAuthAdapter(client).requireConsoleActor()).rejects.toBeInstanceOf(
      AuthUnavailableError,
    );
    // Nothing is read on the strength of a grant that could not be checked.
    expect(calls).not.toContain("from.organization_members");
  });

  it("a failed membership read is unavailable, not no membership (14zcqntk6h2)", async () => {
    const { client } = gateClient({
      actor: missing,
      isAdmin: { data: false, error: null },
      membershipError: { message: "fetch failed" },
    });
    await expect(new SupabaseAuthAdapter(client).requireConsoleActor()).rejects.toBeInstanceOf(
      AuthUnavailableError,
    );
  });

  it.each([
    ["no grant and no membership", { data: false, error: null }, null],
    ["no grant and a medtech membership", { data: false, error: null }, "medtech"],
    ["a null is_admin() answer", { data: null, error: null }, null],
  ])("%s is still no access", async (_case, isAdmin, role) => {
    const { client } = gateClient({
      actor: missing,
      isAdmin,
      membership: role
        ? {
            organization_id: "org-1",
            role,
            status: "active",
            organizations: { name: "Lab One", status: "active" },
          }
        : null,
    });
    await expect(new SupabaseAuthAdapter(client).requireConsoleActor()).rejects.toBeInstanceOf(
      NotAuthorizedError,
    );
  });
});

describe("SupabaseAuthAdapter — the human check (14zcqntnqpc)", () => {
  function signInClient(error: unknown) {
    const { client } = gateClient({ actor: row({ is_super_admin: true }) });
    const sent: unknown[] = [];
    Object.assign(client.auth, {
      signInWithPassword: (credentials: unknown) => {
        sent.push(credentials);
        return Promise.resolve(
          error
            ? { data: { user: null }, error }
            : { data: { user: { id: USER_ID, email: "a@example.test" } }, error: null },
        );
      },
    });
    return { adapter: new SupabaseAuthAdapter(client), sent };
  }

  it("hands the form's token to Supabase as captchaToken", async () => {
    const { adapter, sent } = signInClient(null);
    await adapter.signInWithPassword({
      email: "a@example.test",
      password: "x",
      humanCheckToken: "0.token",
    });
    expect(sent).toEqual([
      { email: "a@example.test", password: "x", options: { captchaToken: "0.token" } },
    ]);
  });

  it("sends no captcha option when the form had no token", async () => {
    const { adapter, sent } = signInClient(null);
    await adapter.signInWithPassword({ email: "a@example.test", password: "x" });
    expect(sent).toEqual([{ email: "a@example.test", password: "x", options: undefined }]);
  });

  it("a refused check is HumanCheckFailedError, not a wrong password", async () => {
    const { adapter } = signInClient({ code: "captcha_failed", message: "captcha protection" });
    await expect(
      adapter.signInWithPassword({ email: "a@example.test", password: "x" }),
    ).rejects.toBeInstanceOf(HumanCheckFailedError);
  });

  it("wrong credentials stay AuthenticationFailedError", async () => {
    const { adapter } = signInClient({ code: "invalid_credentials" });
    await expect(
      adapter.signInWithPassword({ email: "a@example.test", password: "x" }),
    ).rejects.toBeInstanceOf(AuthenticationFailedError);
  });
});

describe("SupabaseAuthAdapter — the authenticator code (14zcqntjnt0)", () => {
  const passwordOnly = { sub: USER_ID, email: "a@example.test", aal: "aal1" };
  const factorList = (totp: { id: string }[], all: Record<string, unknown>[] = []) => ({
    data: { all, totp, phone: [], webauthn: [] },
    error: null,
  });

  it("refuses an admin whose session has only a password, without reading anything more", async () => {
    const { client, calls } = gateClient({
      claims: passwordOnly,
      actor: row({ is_super_admin: true }),
    });
    const refusal = await new SupabaseAuthAdapter(client).requireConsoleActor().catch((e) => e);
    expect(refusal).toBeInstanceOf(SecondFactorRequiredError);
    // Any caller that does not know the second step treats it as signed out.
    expect(refusal).toBeInstanceOf(NotAuthenticatedError);
    expect((refusal as SecondFactorRequiredError).actor.access).toEqual({ kind: "super_admin" });
    expect(calls).toEqual(["auth.getClaims", "rpc.console_actor"]);
  });

  it("refuses an org admin the same way", async () => {
    const { client } = gateClient({ claims: passwordOnly, actor: row(orgAdmin) });
    await expect(new SupabaseAuthAdapter(client).requireConsoleActor()).rejects.toBeInstanceOf(
      SecondFactorRequiredError,
    );
  });

  it("tells a medtech where to go and never asks them for a code", async () => {
    const { client } = gateClient({ claims: passwordOnly, actor: row({}) });
    const adapter = new SupabaseAuthAdapter(client);
    await expect(adapter.requireConsoleActor()).rejects.toBeInstanceOf(NotAuthorizedError);
    await expect(adapter.secondFactorStatus()).rejects.toBeInstanceOf(NotAuthorizedError);
  });

  it("says a passed session has passed, without asking the auth server", async () => {
    const { client, calls } = gateClient({ actor: row({ is_super_admin: true }) });
    const { step } = await new SupabaseAuthAdapter(client).secondFactorStatus();
    expect(step).toBe("passed");
    expect(calls).not.toContain("mfa.listFactors");
  });

  it("asks for the code when an app is confirmed, and for a set-up when none is", async () => {
    const withApp = gateClient({
      claims: passwordOnly,
      actor: row(orgAdmin),
      factors: factorList([{ id: "f-1" }]),
    });
    expect((await new SupabaseAuthAdapter(withApp.client).secondFactorStatus()).step).toBe(
      "enter_code",
    );
    const without = gateClient({
      claims: passwordOnly,
      actor: row(orgAdmin),
      factors: factorList([], [{ id: "f-0", factor_type: "totp", status: "unverified" }]),
    });
    expect((await new SupabaseAuthAdapter(without.client).secondFactorStatus()).step).toBe(
      "set_up",
    );
  });

  it("reads a failed factor lookup as an outage, not as no app", async () => {
    const { client } = gateClient({
      claims: passwordOnly,
      actor: row(orgAdmin),
      factors: { data: null, error: { status: 500 } },
    });
    await expect(new SupabaseAuthAdapter(client).secondFactorStatus()).rejects.toBeInstanceOf(
      AuthUnavailableError,
    );
  });

  it("clears an abandoned set-up, then starts one named for the console", async () => {
    const { client, calls } = gateClient({
      claims: passwordOnly,
      factors: factorList(
        [],
        [
          { id: "stale", factor_type: "totp", status: "unverified" },
          { id: "phone", factor_type: "phone", status: "unverified" },
        ],
      ),
      enroll: {
        data: { id: "new", totp: { qr_code: "data:image/svg+xml;utf-8,<svg/>", secret: "ABC" } },
        error: null,
      },
    });
    const setUp = await new SupabaseAuthAdapter(client).beginSecondFactorSetUp();
    expect(setUp).toEqual({
      setUpId: "new",
      qrCode: "data:image/svg+xml;utf-8,<svg/>",
      secret: "ABC",
    });
    expect(calls).toContain("mfa.unenroll.stale");
    expect(calls).not.toContain("mfa.unenroll.phone");
    expect(calls).toContain("mfa.enroll.totp.AgarthaVision Admin");
  });

  it("passes the provider's refusal of a second app on as a failure", async () => {
    const { client } = gateClient({
      factors: factorList([{ id: "f-1" }]),
      enroll: { data: null, error: { code: "insufficient_aal", status: 403 } },
    });
    const refusal = await new SupabaseAuthAdapter(client).beginSecondFactorSetUp().catch((e) => e);
    expect(refusal).toBeInstanceOf(SecondFactorError);
    expect((refusal as SecondFactorError).reason).toBe("failed");
  });

  it("checks a code against the confirmed app, and a set-up's first code against the set-up", async () => {
    const { client, calls } = gateClient({ factors: factorList([{ id: "f-1" }]) });
    const adapter = new SupabaseAuthAdapter(client);
    await adapter.verifySecondFactor("123456");
    await adapter.confirmSecondFactorSetUp("new", "654321");
    expect(calls).toContain("mfa.verify.f-1.123456");
    expect(calls).toContain("mfa.verify.new.654321");
  });

  it.each([
    [{ code: "mfa_verification_failed", status: 422 }, "rejected"],
    [{ code: "mfa_challenge_expired", status: 422 }, "rejected"],
    [{ code: "over_request_rate_limit", status: 429 }, "rate_limited"],
    [{ code: "unexpected_failure", status: 500 }, "failed"],
  ])("names a refused code (%o) as %s", async (error, reason) => {
    const { client } = gateClient({ factors: factorList([{ id: "f-1" }]), verify: { error } });
    const refusal = await new SupabaseAuthAdapter(client)
      .verifySecondFactor("123456")
      .catch((e) => e);
    expect(refusal).toBeInstanceOf(SecondFactorError);
    expect((refusal as SecondFactorError).reason).toBe(reason);
  });

  it("refuses a code when no app is confirmed, without asking the provider", async () => {
    const { client, calls } = gateClient({ factors: factorList([]) });
    await expect(
      new SupabaseAuthAdapter(client).verifySecondFactor("123456"),
    ).rejects.toBeInstanceOf(SecondFactorError);
    expect(calls.some((call) => call.startsWith("mfa.verify"))).toBe(false);
  });
});
