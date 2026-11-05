import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { attemptKeyHashes } from "@/lib/attempt-limit";
import { SupabaseAttemptLimitAdapter } from "./attempt-limit";

const keys = {
  kind: "invitation" as const,
  email: "Ana@Lab.test",
  ip: "203.0.113.7",
  invitationToken: "b".repeat(64),
};

function service(result: { data?: unknown; error?: unknown } = {}) {
  const calls: { name: string; args: unknown }[] = [];
  const client = {
    rpc(name: string, args: unknown) {
      calls.push({ name, args });
      return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
    },
    from(table: string) {
      return {
        insert(row: unknown) {
          calls.push({ name: `insert:${table}`, args: row });
          return Promise.resolve({ error: result.error ?? null });
        },
      };
    },
  };
  return { calls, make: () => client as unknown as SupabaseClient };
}

describe("SupabaseAttemptLimitAdapter (14zcqntnqp6)", () => {
  const hashes = attemptKeyHashes(keys);

  it("counts by the hashed keys since the window's start", async () => {
    const { calls, make } = service({ data: [{ by_email: 3, by_ip: 7, by_invitation: 2 }] });
    const since = new Date("2026-10-29T11:45:00.000Z");
    await expect(new SupabaseAttemptLimitAdapter(make).countFailures(keys, since)).resolves.toEqual(
      {
        email: 3,
        ip: 7,
        invitation: 2,
      },
    );
    expect(calls).toEqual([
      {
        name: "console_failed_attempts",
        args: {
          p_email_hash: hashes.email,
          p_ip_hash: hashes.ip,
          p_token_hash: hashes.token,
          p_since: "2026-10-29T11:45:00.000Z",
        },
      },
    ]);
  });

  it("records one row of hashes, never the email, IP or token itself", async () => {
    const { calls, make } = service();
    await new SupabaseAttemptLimitAdapter(make).recordFailure(keys);
    expect(calls).toEqual([
      {
        name: "insert:console_sign_in_attempts",
        args: {
          kind: "invitation",
          email_hash: hashes.email,
          ip_hash: hashes.ip,
          token_hash: hashes.token,
        },
      },
    ]);
    expect(JSON.stringify(calls)).not.toMatch(/ana@lab|203\.0\.113|b{64}/i);
  });

  it("passes a database error on, for the caller to fail open", async () => {
    const { make } = service({ error: { message: "permission denied" } });
    await expect(
      new SupabaseAttemptLimitAdapter(make).countFailures(keys, new Date()),
    ).rejects.toMatchObject({ message: "permission denied" });
    await expect(new SupabaseAttemptLimitAdapter(make).recordFailure(keys)).rejects.toMatchObject({
      message: "permission denied",
    });
  });
});
