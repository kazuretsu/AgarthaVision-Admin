import { beforeEach, describe, expect, it, vi } from "vitest";
import { acceptInvitation } from "./actions";
import { EMPTY_ACCEPT_STATE } from "./state";

const { findInvitation, accept, signOut, withAttemptLimit, redirect } = vi.hoisted(() => ({
  findInvitation: vi.fn(),
  accept: vi.fn(),
  signOut: vi.fn(),
  withAttemptLimit: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/adapters/registry", () => ({
  getOnboarding: async () => ({ findInvitation, acceptInvitation: accept }),
  getAuth: async () => ({ signOut }),
  getAttemptLimit: async () => ({}),
}));
vi.mock("@/lib/attempt-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/attempt-limit")>()),
  withAttemptLimit,
}));

const PASSWORD = "Correct-Horse-9-Battery";

function acceptForm(fullName: string): FormData {
  const data = new FormData();
  data.set("token", "invitation-token");
  data.set("password", PASSWORD);
  data.set("confirmPassword", PASSWORD);
  data.set("fullName", fullName);
  return data;
}

/** `redirect` ends the action in Next.js by throwing; the mock does the same. */
class Redirected extends Error {}

describe("acceptInvitation: the invitee's name (14zcqnty5p2)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    redirect.mockImplementation((to: string) => {
      throw new Redirected(to);
    });
    findInvitation.mockResolvedValue({ state: "pending", email: "medtech@example.com" });
    withAttemptLimit.mockImplementation((_limit, _attempt, run: () => unknown) => run());
    accept.mockResolvedValue({ role: "medtech" });
  });

  it("AC1 refuses an empty name before any account is made", async () => {
    await expect(acceptInvitation(EMPTY_ACCEPT_STATE, acceptForm(""))).resolves.toMatchObject({
      error: "Enter your name.",
    });
    expect(findInvitation).not.toHaveBeenCalled();
    expect(withAttemptLimit).not.toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("AC1 refuses a name of only spaces, which passes the browser's required check", async () => {
    await expect(acceptInvitation(EMPTY_ACCEPT_STATE, acceptForm(" \t  "))).resolves.toMatchObject({
      error: "Enter your name.",
    });
    expect(accept).not.toHaveBeenCalled();
  });

  it("AC2 keeps what was typed when the name is refused", async () => {
    await expect(acceptInvitation(EMPTY_ACCEPT_STATE, acceptForm("   "))).resolves.toEqual({
      error: "Enter your name.",
      fullName: "   ",
    });
  });

  it("AC3 accepts a valid name, trimmed and spaced once", async () => {
    await expect(
      acceptInvitation(EMPTY_ACCEPT_STATE, acceptForm("  Maria   Santos ")),
    ).rejects.toThrow(Redirected);
    expect(accept).toHaveBeenCalledWith(
      expect.objectContaining({ token: "invitation-token", fullName: "Maria Santos" }),
    );
    expect(redirect).toHaveBeenCalledWith("/invite/joined");
  });

  it("AC4 still refuses a name over 120 characters, with the existing message", async () => {
    await expect(
      acceptInvitation(EMPTY_ACCEPT_STATE, acceptForm("a".repeat(121))),
    ).resolves.toMatchObject({ error: "A name can have at most 120 characters." });
    expect(accept).not.toHaveBeenCalled();
  });
});
