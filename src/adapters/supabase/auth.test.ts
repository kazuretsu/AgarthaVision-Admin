import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { NotAuthorizedError } from "@/ports/auth";
import { SupabaseAuthAdapter } from "./auth";

const USER_ID = "00000000-0000-4000-8000-000000000001";

interface Answers {
  /** What `is_admin()` returns for the caller. */
  isAdmin: { data: unknown; error: unknown };
  /** The caller's profile row. `role` is there to prove nothing reads it. */
  profile: Record<string, unknown> | null;
  /** The caller's membership row, or none. */
  membership?: Record<string, unknown> | null;
}

/**
 * A client that answers the gate's three reads and records what was asked: the selected
 * columns per table and every RPC call.
 */
function gateClient(answers: Answers) {
  const selects: Record<string, string> = {};
  const rpcs: { name: string; args: unknown }[] = [];
  const client = {
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: USER_ID, email: "a@example.test" } }, error: null }),
    },
    rpc(name: string, args: unknown) {
      rpcs.push({ name, args });
      return Promise.resolve(answers.isAdmin);
    },
    from(table: string) {
      const builder: Record<string, unknown> = {
        select(columns: string) {
          selects[table] = columns;
          return builder;
        },
        eq: () => builder,
        maybeSingle: () =>
          Promise.resolve({
            data: table === "profiles" ? answers.profile : (answers.membership ?? null),
            error: null,
          }),
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, selects, rpcs };
}

const activeMembership = {
  organization_id: "org-1",
  role: "org_admin",
  status: "active",
  organizations: { name: "Lab One", status: "active" },
};

describe("SupabaseAuthAdapter — who is a super admin (D22)", () => {
  it("asks is_admin() for the signed-in user and never reads profiles.role", async () => {
    const { client, selects, rpcs } = gateClient({
      isAdmin: { data: true, error: null },
      profile: { full_name: "Ana", role: "medtech" },
    });
    await new SupabaseAuthAdapter(client).requireConsoleActor();

    expect(rpcs).toEqual([{ name: "is_admin", args: { user_id: USER_ID } }]);
    expect(selects.profiles).not.toMatch(/\brole\b/);
  });

  it("makes an active grant a super admin even when profiles.role says medtech", async () => {
    const { client } = gateClient({
      isAdmin: { data: true, error: null },
      profile: { full_name: "Ana", role: "medtech" },
    });
    const actor = await new SupabaseAuthAdapter(client).requireConsoleActor();

    expect(actor.access).toEqual({ kind: "super_admin" });
    expect(actor.user).toMatchObject({ fullName: "Ana", isSuperAdmin: true });
  });

  it("refuses a revoked grant even when profiles.role still says admin", async () => {
    const { client } = gateClient({
      isAdmin: { data: false, error: null },
      profile: { full_name: "Ben", role: "admin" },
    });

    await expect(new SupabaseAuthAdapter(client).requireConsoleActor()).rejects.toBeInstanceOf(
      NotAuthorizedError,
    );
  });

  it("treats a failed is_admin() call as no grant", async () => {
    const { client } = gateClient({
      isAdmin: { data: null, error: { message: "boom" } },
      profile: { full_name: "Ben", role: "admin" },
    });

    await expect(new SupabaseAuthAdapter(client).requireConsoleActor()).rejects.toBeInstanceOf(
      NotAuthorizedError,
    );
  });

  it("still lets an org admin in through their membership", async () => {
    const { client } = gateClient({
      isAdmin: { data: false, error: null },
      profile: { full_name: "Cy", role: "medtech" },
      membership: activeMembership,
    });
    const actor = await new SupabaseAuthAdapter(client).requireConsoleActor();

    expect(actor.access).toEqual({
      kind: "org_admin",
      organizationId: "org-1",
      organizationName: "Lab One",
    });
  });
});
