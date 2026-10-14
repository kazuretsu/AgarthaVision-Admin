import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { AdminWriteError } from "@/ports";
import { SupabaseAdminWriteAdapter } from "./admin-write";

/** A client whose every function call fails with `code`. */
function failingWith(code: string) {
  const client = {
    rpc: async () => ({ data: null, error: { code, message: "refused", hint: "" } }),
  } as unknown as SupabaseClient;
  return new SupabaseAdminWriteAdapter(client);
}

async function reasonOf(code: string) {
  const error = await failingWith(code)
    .recordExport("00000000-0000-4000-8000-000000000001", {})
    .catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(AdminWriteError);
  return (error as AdminWriteError).reason;
}

describe("SupabaseAdminWriteAdapter — a refusal's reason", () => {
  it.each([
    ["42501", "forbidden"],
    ["23505", "conflict"],
    ["P0002", "not_found"],
    // An export filed under an organization that does not exist (14zcqntjw7c).
    ["23503", "not_found"],
    ["23514", "invalid"],
    ["22023", "invalid"],
    ["08006", "failed"],
  ])("%s is %s", async (code, reason) => {
    expect(await reasonOf(code)).toBe(reason);
  });
});
