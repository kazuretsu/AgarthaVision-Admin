import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { attemptEmail, type AttemptKeys } from "@/domain/attempt-limits";
import type { AttemptLimitPort } from "@/ports/attempt-limit";
import {
  TooManyAttemptsError,
  attemptKeyHashes,
  clientIp,
  withAttemptLimit,
} from "./attempt-limit";

/** An in-memory store counting as `console_failed_attempts` does (admin/0022). */
function memoryLimits() {
  const failures: (AttemptKeys & { at: number })[] = [];
  let now = Date.parse("2026-10-29T12:00:00.000Z");
  const port: AttemptLimitPort = {
    async countFailures(keys, since) {
      const recent = failures.filter((f) => f.at >= since.getTime());
      return {
        email: recent.filter((f) => attemptEmail(f.email) === attemptEmail(keys.email)).length,
        ip: keys.ip ? recent.filter((f) => f.ip === keys.ip).length : 0,
        invitation:
          keys.kind === "invitation" && keys.invitationToken
            ? recent.filter(
                (f) => f.kind === "invitation" && f.invitationToken === keys.invitationToken,
              ).length
            : 0,
      };
    },
    async recordFailure(keys) {
      failures.push({ ...keys, at: now });
    },
  };
  return {
    failures,
    open: async () => port,
    clock: () => new Date(now),
    advance: (ms: number) => (now += ms),
  };
}

class WrongPassword extends Error {}

const signIn = (email: string, ip: string | null = "203.0.113.7"): AttemptKeys => ({
  kind: "sign_in",
  email,
  ip,
  invitationToken: null,
});

const invitation = (token: string, ip: string): AttemptKeys => ({
  kind: "invitation",
  email: "invitee@lab.test",
  ip,
  invitationToken: token,
});

/** A provider that knows one password, and counts how often it was asked. */
function provider(correct = "right") {
  let calls = 0;
  return {
    calls: () => calls,
    tryPassword: (password: string) => async () => {
      calls++;
      if (password !== correct) throw new WrongPassword();
      return "signed in";
    },
  };
}

const isWrong = (cause: unknown) => cause instanceof WrongPassword;

afterEach(() => vi.restoreAllMocks());

describe("withAttemptLimit (14zcqntnqp6)", () => {
  it("AC1: refuses the 6th wrong password for one email before the provider is called", async () => {
    const limits = memoryLimits();
    const auth = provider();
    for (let i = 0; i < 5; i++) {
      await expect(
        withAttemptLimit(
          limits.open,
          signIn("ana@lab.test"),
          auth.tryPassword("x"),
          isWrong,
          limits.clock,
        ),
      ).rejects.toBeInstanceOf(WrongPassword);
    }
    await expect(
      withAttemptLimit(
        limits.open,
        signIn("ANA@lab.test", "198.51.100.1"),
        auth.tryPassword("right"),
        isWrong,
        limits.clock,
      ),
    ).rejects.toBeInstanceOf(TooManyAttemptsError);
    expect(auth.calls()).toBe(5);
    expect(limits.failures).toHaveLength(5);
  });

  it("AC1: lets the correct password in once the failures are 15 minutes old", async () => {
    const limits = memoryLimits();
    const auth = provider();
    for (let i = 0; i < 5; i++) {
      await withAttemptLimit(
        limits.open,
        signIn("ana@lab.test"),
        auth.tryPassword("x"),
        isWrong,
        limits.clock,
      ).catch(() => {});
    }
    limits.advance(15 * 60 * 1000 - 1);
    await expect(
      withAttemptLimit(
        limits.open,
        signIn("ana@lab.test"),
        auth.tryPassword("right"),
        isWrong,
        limits.clock,
      ),
    ).rejects.toBeInstanceOf(TooManyAttemptsError);
    limits.advance(2);
    await expect(
      withAttemptLimit(
        limits.open,
        signIn("ana@lab.test"),
        auth.tryPassword("right"),
        isWrong,
        limits.clock,
      ),
    ).resolves.toBe("signed in");
  });

  it("a success erases nothing: the failures still count until they expire", async () => {
    const limits = memoryLimits();
    const auth = provider();
    for (let i = 0; i < 4; i++) {
      await withAttemptLimit(
        limits.open,
        signIn("ana@lab.test"),
        auth.tryPassword("x"),
        isWrong,
        limits.clock,
      ).catch(() => {});
    }
    await withAttemptLimit(
      limits.open,
      signIn("ana@lab.test"),
      auth.tryPassword("right"),
      isWrong,
      limits.clock,
    );
    await withAttemptLimit(
      limits.open,
      signIn("ana@lab.test"),
      auth.tryPassword("x"),
      isWrong,
      limits.clock,
    ).catch(() => {});
    await expect(
      withAttemptLimit(
        limits.open,
        signIn("ana@lab.test"),
        auth.tryPassword("right"),
        isWrong,
        limits.clock,
      ),
    ).rejects.toBeInstanceOf(TooManyAttemptsError);
  });

  it("AC2: refuses the 21st failure from one IP across different emails", async () => {
    const limits = memoryLimits();
    const auth = provider();
    for (let i = 0; i < 20; i++) {
      await expect(
        withAttemptLimit(
          limits.open,
          signIn(`person${i}@lab.test`),
          auth.tryPassword("x"),
          isWrong,
          limits.clock,
        ),
      ).rejects.toBeInstanceOf(WrongPassword);
    }
    await expect(
      withAttemptLimit(
        limits.open,
        signIn("fresh@lab.test"),
        auth.tryPassword("x"),
        isWrong,
        limits.clock,
      ),
    ).rejects.toBeInstanceOf(TooManyAttemptsError);
    // Another IP is not held back by this one.
    await expect(
      withAttemptLimit(
        limits.open,
        signIn("fresh@lab.test", "198.51.100.1"),
        auth.tryPassword("right"),
        isWrong,
        limits.clock,
      ),
    ).resolves.toBe("signed in");
  });

  it("with no IP, limits by email only", async () => {
    const limits = memoryLimits();
    const auth = provider();
    for (let i = 0; i < 25; i++) {
      await withAttemptLimit(
        limits.open,
        signIn(`p${i}@lab.test`, null),
        auth.tryPassword("x"),
        isWrong,
        limits.clock,
      ).catch(() => {});
    }
    await expect(
      withAttemptLimit(
        limits.open,
        signIn("fresh@lab.test", null),
        auth.tryPassword("right"),
        isWrong,
        limits.clock,
      ),
    ).resolves.toBe("signed in");
  });

  it("AC3: refuses the 6th wrong password on one invitation, from any IP", async () => {
    const limits = memoryLimits();
    const auth = provider();
    for (let i = 0; i < 5; i++) {
      await expect(
        withAttemptLimit(
          limits.open,
          invitation("tok-1", `203.0.113.${i}`),
          auth.tryPassword("x"),
          isWrong,
          limits.clock,
        ),
      ).rejects.toBeInstanceOf(WrongPassword);
    }
    await expect(
      withAttemptLimit(
        limits.open,
        invitation("tok-1", "198.51.100.1"),
        auth.tryPassword("right"),
        isWrong,
        limits.clock,
      ),
    ).rejects.toBeInstanceOf(TooManyAttemptsError);
    expect(auth.calls()).toBe(5);
  });

  it("wrong passwords on the invitation page count for the email at sign-in too", async () => {
    const limits = memoryLimits();
    const auth = provider();
    for (let i = 0; i < 5; i++) {
      await withAttemptLimit(
        limits.open,
        invitation(`tok-${i}`, `203.0.113.${i}`),
        auth.tryPassword("x"),
        isWrong,
        limits.clock,
      ).catch(() => {});
    }
    await expect(
      withAttemptLimit(
        limits.open,
        signIn("invitee@lab.test", "198.51.100.1"),
        auth.tryPassword("right"),
        isWrong,
        limits.clock,
      ),
    ).rejects.toBeInstanceOf(TooManyAttemptsError);
  });

  it("only what the caller calls a failure is counted, and every error is passed on", async () => {
    const limits = memoryLimits();
    const other = new Error("provider down");
    await expect(
      withAttemptLimit(
        limits.open,
        signIn("ana@lab.test"),
        () => Promise.reject(other),
        isWrong,
        limits.clock,
      ),
    ).rejects.toBe(other);
    expect(limits.failures).toHaveLength(0);
  });

  it("AC4: fails open when the failures cannot be counted", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const broken: AttemptLimitPort = {
      countFailures: () => Promise.reject(new Error("database down")),
      recordFailure: () => Promise.reject(new Error("database down")),
    };
    const auth = provider();
    await expect(
      withAttemptLimit(
        async () => broken,
        signIn("ana@lab.test"),
        auth.tryPassword("right"),
        isWrong,
      ),
    ).resolves.toBe("signed in");
    // A failure that cannot be stored still reaches the caller as the wrong password it was.
    await expect(
      withAttemptLimit(async () => broken, signIn("ana@lab.test"), auth.tryPassword("x"), isWrong),
    ).rejects.toBeInstanceOf(WrongPassword);
    expect(console.error).toHaveBeenCalledTimes(3);
  });

  it("fails open when the limiter cannot even be built", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const auth = provider();
    await expect(
      withAttemptLimit(
        () => Promise.reject(new Error("SUPABASE_SERVICE_ROLE_KEY is not set")),
        signIn("ana@lab.test"),
        auth.tryPassword("x"),
        isWrong,
      ),
    ).rejects.toBeInstanceOf(WrongPassword);
    expect(auth.calls()).toBe(1);
  });
});

describe("attemptKeyHashes", () => {
  const sha = (value: string) => createHash("sha256").update(value).digest("hex");

  it("stores SHA-256 hashes, the email lower-cased, nothing in the clear", () => {
    const hashes = attemptKeyHashes({
      kind: "invitation",
      email: " Ana@Lab.test",
      ip: "203.0.113.7",
      invitationToken: "a".repeat(64),
    });
    expect(hashes).toEqual({
      email: sha("ana@lab.test"),
      ip: sha("203.0.113.7"),
      // As console_invitation_token_hash stores the link (admin/0005).
      token: sha("a".repeat(64)),
    });
  });

  it("a sign-in has no link, and a missing IP no IP hash", () => {
    expect(
      attemptKeyHashes({ kind: "sign_in", email: "a@b.test", ip: null, invitationToken: "t" }),
    ).toMatchObject({ ip: null, token: null });
  });
});

describe("clientIp", () => {
  const headers = (entries: Record<string, string>) => new Headers(entries);

  it("reads the first entry of x-forwarded-for by default", () => {
    expect(clientIp(headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }), undefined)).toBe(
      "203.0.113.7",
    );
  });

  it("reads the header TRUSTED_IP_HEADER names instead", () => {
    const sent = headers({ "x-forwarded-for": "198.51.100.9", "cf-connecting-ip": "203.0.113.7" });
    expect(clientIp(sent, "CF-Connecting-IP")).toBe("203.0.113.7");
    expect(clientIp(sent, "  ")).toBe("198.51.100.9");
  });

  it("is null when the header is missing or empty", () => {
    expect(clientIp(headers({}), undefined)).toBeNull();
    expect(clientIp(headers({ "x-forwarded-for": " , 10.0.0.1" }), undefined)).toBeNull();
  });
});
