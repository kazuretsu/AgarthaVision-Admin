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
