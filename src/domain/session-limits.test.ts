import { describe, expect, it } from "vitest";
import { DEFAULT_SESSION_LIMITS, sessionEnd, sessionLimitsFrom } from "./session-limits";

const HOUR = 60 * 60 * 1000;
const limits = DEFAULT_SESSION_LIMITS;
const now = 100 * HOUR;

describe("sessionLimitsFrom", () => {
  it("defaults to 12 hours and 1 hour", () => {
    expect(sessionLimitsFrom({})).toEqual({ absoluteMs: 12 * HOUR, idleMs: HOUR });
  });

  it("reads the environment, and ignores anything not a positive number", () => {
    expect(
      sessionLimitsFrom({ CONSOLE_SESSION_MAX_HOURS: "0.05", CONSOLE_SESSION_IDLE_MINUTES: "2" }),
    ).toEqual({ absoluteMs: 0.05 * HOUR, idleMs: 2 * 60 * 1000 });
    expect(
      sessionLimitsFrom({ CONSOLE_SESSION_MAX_HOURS: "-1", CONSOLE_SESSION_IDLE_MINUTES: "soon" }),
    ).toEqual({ absoluteMs: 12 * HOUR, idleMs: HOUR });
    expect(sessionLimitsFrom({ CONSOLE_SESSION_MAX_HOURS: " " }).absoluteMs).toBe(12 * HOUR);
  });
});

describe("sessionEnd", () => {
  const base = { now, limits, idleLimitOn: true };

  it("lets an active session within both limits go on", () => {
    expect(sessionEnd({ ...base, signedInAt: now - 2 * HOUR, lastActivityAt: now - 1000 })).toBe(
      null,
    );
  });

  it("ends a session 12 hours after sign-in, however active", () => {
    expect(
      sessionEnd({ ...base, signedInAt: now - 12 * HOUR - 1, lastActivityAt: now - 1000 }),
    ).toBe("absolute");
  });

  it("ends a session idle for over an hour", () => {
    expect(
      sessionEnd({ ...base, signedInAt: now - 3 * HOUR, lastActivityAt: now - HOUR - 1 }),
    ).toBe("idle");
  });

  it("counts a missing record as idle since sign-in, so deleting it buys nothing", () => {
    expect(sessionEnd({ ...base, signedInAt: now - 5 * 60 * 1000, lastActivityAt: null })).toBe(
      null,
    );
    expect(sessionEnd({ ...base, signedInAt: now - 2 * HOUR, lastActivityAt: null })).toBe("idle");
  });

  it("never lets a record older than the sign-in shorten or extend it", () => {
    expect(
      sessionEnd({ ...base, signedInAt: now - 10 * 60 * 1000, lastActivityAt: now - 5 * HOUR }),
    ).toBe(null);
  });

  it("ends a session whose record was edited", () => {
    expect(sessionEnd({ ...base, signedInAt: now - 1000, lastActivityAt: "tampered" })).toBe(
      "tampered",
    );
  });

  it("ends a session whose sign-in time is unknown", () => {
    expect(sessionEnd({ ...base, signedInAt: null, lastActivityAt: now })).toBe("absolute");
  });

  it("keeps the absolute limit when the idle limit is off", () => {
    const off = { ...base, idleLimitOn: false };
    expect(sessionEnd({ ...off, signedInAt: now - 2 * HOUR, lastActivityAt: "tampered" })).toBe(
      null,
    );
    expect(sessionEnd({ ...off, signedInAt: now - 13 * HOUR, lastActivityAt: null })).toBe(
      "absolute",
    );
  });
});
