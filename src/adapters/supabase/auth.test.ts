import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { NotAuthenticatedError, NotAuthorizedError } from "@/ports/auth";
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
}

/** A client that answers the gate and records every auth call, RPC and table read. */
function gateClient(answers: Answers) {
  const calls: string[] = [];
  const selects: Record<string, string> = {};
  const client = {
    auth: {
      getClaims: () => {
        calls.push("auth.getClaims");
        const claims =
          answers.claims === undefined ? { sub: USER_ID, email: "a@example.test" } : answers.claims;
        return Promise.resolve({ data: claims ? { claims } : null, error: null });
      },
      getUser: () => {
        calls.push("auth.getUser");
        return Promise.resolve({ data: { user: { id: USER_ID } }, error: null });
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
            error: null,
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

  it("treats a failed console_actor() call as no access", async () => {
    const { client } = gateClient({ actor: { data: null, error: { code: "57014" } } });
    await expect(new SupabaseAuthAdapter(client).requireConsoleActor()).rejects.toBeInstanceOf(
      NotAuthorizedError,
    );
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

  it("still lets an org admin in through their membership, and refuses a failed is_admin()", async () => {
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

    const failed = gateClient({
      actor: missing,
      isAdmin: { data: null, error: { message: "boom" } },
      profile: { full_name: "Ben", role: "admin" },
    });
    await expect(
      new SupabaseAuthAdapter(failed.client).requireConsoleActor(),
    ).rejects.toBeInstanceOf(NotAuthorizedError);
  });
});
