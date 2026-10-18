import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { AccountAccessError } from "@/ports/account-access";
import { BAN_DURATION, SupabaseAccountAccessAdapter } from "./account-access";

function service(error: unknown = null) {
  const calls: { id: string; attributes: unknown }[] = [];
  const client = {
    auth: {
      admin: {
        updateUserById(id: string, attributes: unknown) {
          calls.push({ id, attributes });
          return Promise.resolve({ data: {}, error });
        },
      },
    },
  };
  return { calls, make: () => client as unknown as SupabaseClient };
}

describe("SupabaseAccountAccessAdapter", () => {
  it("blocks with a ban and allows by lifting it; nothing else changes", async () => {
    const { calls, make } = service();
    const adapter = new SupabaseAccountAccessAdapter(make);
    await adapter.setSignInAllowed("acc-1", false);
    await adapter.setSignInAllowed("acc-1", true);
    expect(calls).toEqual([
      { id: "acc-1", attributes: { ban_duration: BAN_DURATION } },
      { id: "acc-1", attributes: { ban_duration: "none" } },
    ]);
  });

  it("a refusal is an AccountAccessError", async () => {
    const { make } = service({ message: "nope" });
    await expect(
      new SupabaseAccountAccessAdapter(make).setSignInAllowed("acc-1", false),
    ).rejects.toBeInstanceOf(AccountAccessError);
  });
});

describe("SupabaseAccountAccessAdapter — authenticator apps (14zcqntjnt0)", () => {
  function mfaService(factors: { id: string; status: string }[], deleteError: unknown = null) {
    const deleted: string[] = [];
    const client = {
      auth: {
        admin: {
          mfa: {
            listFactors: ({ userId }: { userId: string }) =>
              Promise.resolve(
                userId === "acc-1"
                  ? { data: { factors }, error: null }
                  : { data: null, error: { message: "unknown user" } },
              ),
            deleteFactor: ({ id }: { id: string; userId: string }) => {
              deleted.push(id);
              return Promise.resolve({ data: { id }, error: deleteError });
            },
          },
        },
      },
    };
    return { deleted, make: () => client as unknown as SupabaseClient };
  }

  it("counts only a confirmed app as set up", async () => {
    const confirmed = mfaService([{ id: "f-1", status: "verified" }]);
    const pending = mfaService([{ id: "f-0", status: "unverified" }]);
    expect(await new SupabaseAccountAccessAdapter(confirmed.make).hasAuthenticator("acc-1")).toBe(
      true,
    );
    expect(await new SupabaseAccountAccessAdapter(pending.make).hasAuthenticator("acc-1")).toBe(
      false,
    );
  });

  it("a reset removes every factor the login has, confirmed or not", async () => {
    const { deleted, make } = mfaService([
      { id: "f-1", status: "verified" },
      { id: "f-0", status: "unverified" },
    ]);
    await new SupabaseAccountAccessAdapter(make).resetAuthenticator("acc-1");
    expect(deleted).toEqual(["f-1", "f-0"]);
  });

  it("a failed read or delete is an AccountAccessError", async () => {
    const failing = mfaService([{ id: "f-1", status: "verified" }], { message: "nope" });
    await expect(
      new SupabaseAccountAccessAdapter(failing.make).resetAuthenticator("acc-1"),
    ).rejects.toBeInstanceOf(AccountAccessError);
    await expect(
      new SupabaseAccountAccessAdapter(failing.make).hasAuthenticator("acc-2"),
    ).rejects.toBeInstanceOf(AccountAccessError);
  });
});
