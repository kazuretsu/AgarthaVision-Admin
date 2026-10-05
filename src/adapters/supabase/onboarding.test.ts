import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { AcceptInvitationError } from "@/ports/onboarding";
import { SupabaseOnboardingAdapter, isInvitationToken } from "./onboarding";

const TOKEN = "ab".repeat(32);

const PENDING = {
  email: "ana@example.test",
  full_name: "Ana",
  role: "medtech",
  organization_name: "Lab A",
  state: "pending",
  expires_at: "2026-10-12T00:00:00Z",
};

interface Script {
  link?: Record<string, unknown> | null;
  createError?: { code?: string; message?: string } | null;
  signInError?: unknown;
  acceptError?: { code?: string; hint?: string } | null;
}

/** The visitor's client and the service client, answering as scripted and recording calls. */
function clients(script: Script) {
  const calls: string[] = [];
  const created: unknown[] = [];
  const visitor = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push(`rpc:${name}`);
      if (name === "console_invitation_by_token") {
        return Promise.resolve({ data: script.link ? [script.link] : [], error: null });
      }
      return Promise.resolve({
        data: [{ organization_id: "lab-a", role: "medtech" }],
        error: script.acceptError ?? null,
        args,
      });
    },
    auth: {
      signInWithPassword(credentials: { email: string }) {
        calls.push(`signIn:${credentials.email}`);
        return Promise.resolve(
          script.signInError
            ? { data: { user: null }, error: script.signInError }
            : { data: { user: { id: "u1" } }, error: null },
        );
      },
      signOut() {
        calls.push("signOut");
        return Promise.resolve({ error: null });
      },
    },
  };
  const service = {
    auth: {
      admin: {
        createUser(attributes: unknown) {
          calls.push("createUser");
          created.push(attributes);
          return Promise.resolve({ data: {}, error: script.createError ?? null });
        },
      },
    },
  };
  const adapter = new SupabaseOnboardingAdapter(
    visitor as unknown as SupabaseClient,
    () => service as unknown as SupabaseClient,
  );
  return { adapter, calls, created };
}

const REQUEST = { token: TOKEN, password: "long-enough", fullName: "Ana Cruz" };

describe("isInvitationToken", () => {
  it("accepts 64 lower-case hex characters only", () => {
    expect(isInvitationToken(TOKEN)).toBe(true);
    expect(isInvitationToken(TOKEN.toUpperCase())).toBe(false);
    expect(isInvitationToken("ab")).toBe(false);
    expect(isInvitationToken(`${TOKEN}'--`)).toBe(false);
  });
});

describe("SupabaseOnboardingAdapter", () => {
  it("does not ask the database about a malformed token", async () => {
    const { adapter, calls } = clients({ link: PENDING });
    expect(await adapter.findInvitation("nope")).toBeNull();
    expect(calls).toEqual([]);
  });

  it("makes the account for the invitation's email, confirmed, with no metadata", async () => {
    const { adapter, calls, created } = clients({ link: PENDING });
    await expect(adapter.acceptInvitation(REQUEST)).resolves.toEqual({ role: "medtech" });
    expect(created).toEqual([
      { email: "ana@example.test", password: "long-enough", email_confirm: true },
    ]);
    expect(calls).toEqual([
      "rpc:console_invitation_by_token",
      "createUser",
      "signIn:ana@example.test",
      "rpc:console_accept_invitation",
    ]);
  });

  it("makes no account for a link that is not pending", async () => {
    for (const state of ["expired", "revoked", "accepted", "unavailable"]) {
      const { adapter, calls } = clients({ link: { ...PENDING, state } });
      await expect(adapter.acceptInvitation(REQUEST)).rejects.toMatchObject({ reason: state });
      expect(calls).not.toContain("createUser");
    }
    const { adapter } = clients({ link: null });
    await expect(adapter.acceptInvitation(REQUEST)).rejects.toMatchObject({
      reason: "invalid_link",
    });
  });

  it("uses the account already made for this email rather than a second one", async () => {
    const { adapter, calls } = clients({
      link: PENDING,
      createError: {
        code: "email_exists",
        message: "A user with this email address has already been registered",
      },
    });
    await expect(adapter.acceptInvitation(REQUEST)).resolves.toEqual({ role: "medtech" });
    expect(calls).toContain("rpc:console_accept_invitation");
  });

  it("an existing account with another password is wrong_password", async () => {
    const { adapter, calls } = clients({
      link: PENDING,
      createError: { code: "email_exists" },
      signInError: { message: "Invalid login credentials" },
    });
    await expect(adapter.acceptInvitation(REQUEST)).rejects.toMatchObject({
      reason: "wrong_password",
    });
    expect(calls).not.toContain("rpc:console_accept_invitation");
  });

  it("a password Supabase refuses is weak_password", async () => {
    const { adapter } = clients({ link: PENDING, createError: { code: "weak_password" } });
    await expect(adapter.acceptInvitation(REQUEST)).rejects.toMatchObject({
      reason: "weak_password",
    });
  });

  it("signs out again when the database refuses the acceptance", async () => {
    const { adapter, calls } = clients({
      link: PENDING,
      acceptError: { code: "23505", hint: "already_member" },
    });
    const failure = adapter.acceptInvitation(REQUEST);
    await expect(failure).rejects.toBeInstanceOf(AcceptInvitationError);
    await expect(failure).rejects.toMatchObject({ reason: "already_member" });
    expect(calls.at(-1)).toBe("signOut");
  });
});
