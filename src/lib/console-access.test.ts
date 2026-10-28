import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthUnavailableError,
  NotAuthenticatedError,
  NotAuthorizedError,
  SecondFactorRequiredError,
  type AuthPort,
} from "@/ports/auth";
import { unavailableReference } from "./unavailable";

const requireConsoleActor = vi.fn<AuthPort["requireConsoleActor"]>();
vi.mock("@/adapters/registry", () => ({
  getAuth: async () => ({ requireConsoleActor }),
}));
vi.spyOn(console, "error").mockImplementation(() => {});

const { ANY_CONSOLE_USER, getConsoleActor, requireRouteAccess } = await import("./console-access");

const user = { id: "u", email: null, fullName: null, isSuperAdmin: false };

beforeEach(() => {
  requireConsoleActor.mockReset();
});

describe("requireRouteAccess (14zcqntk6h2)", () => {
  it("answers 503 with no database detail when access could not be read", async () => {
    requireConsoleActor.mockRejectedValue(
      new AuthUnavailableError({ message: "connect ECONNREFUSED 10.0.0.5:5432" }),
    );
    const result = await requireRouteAccess(ANY_CONSOLE_USER);
    if (!("response" in result)) throw new Error("expected a response");
    expect(result.response.status).toBe(503);
    const body = await result.response.text();
    expect(body).toContain("can't reach its data");
    expect(body).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|5432/);
  });

  it.each([
    ["no session", new NotAuthenticatedError(), 401],
    ["no console access", new NotAuthorizedError(user), 403],
  ])("still answers %s as before", async (_case, error, status) => {
    requireConsoleActor.mockRejectedValue(error);
    const result = await requireRouteAccess(ANY_CONSOLE_USER);
    if (!("response" in result)) throw new Error("expected a response");
    expect(result.response.status).toBe(status);
  });
});

describe("getConsoleActor (14zcqntk6h2)", () => {
  it("throws an outage on, with a digest the error boundaries recognise", async () => {
    requireConsoleActor.mockRejectedValue(new AuthUnavailableError());
    const thrown = (await getConsoleActor().catch((e) => e)) as Error & { digest?: string };
    expect(thrown).toBeInstanceOf(AuthUnavailableError);
    expect(unavailableReference(thrown.digest)).not.toBeNull();
  });

  it("leaves a refusal unmarked", async () => {
    requireConsoleActor.mockRejectedValue(new NotAuthorizedError(user));
    const thrown = (await getConsoleActor().catch((e) => e)) as Error & { digest?: string };
    expect(thrown).toBeInstanceOf(NotAuthorizedError);
    expect(thrown.digest).toBeUndefined();
  });
});

describe("requireRouteAccess — the authenticator code (14zcqntjnt0)", () => {
  it("refuses a session that has not entered its code with 401, serving nothing", async () => {
    requireConsoleActor.mockRejectedValue(
      new SecondFactorRequiredError({
        user,
        access: { kind: "super_admin" },
        secondFactorOn: true,
      }),
    );
    const result = await requireRouteAccess(ANY_CONSOLE_USER);
    if (!("response" in result)) throw new Error("expected a response");
    expect(result.response.status).toBe(401);
    expect(await result.response.text()).toContain("Authenticator code required");
  });
});
