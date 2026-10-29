import { describe, expect, it } from "vitest";
import {
  ATTEMPT_LIMITS,
  TOO_MANY_ATTEMPTS,
  attemptEmail,
  attemptWindowStart,
  attemptsExhausted,
} from "./attempt-limits";

describe("attempt limits (14zcqntnqp6)", () => {
  const none = { email: 0, ip: 0, invitation: 0 };

  it("AC4: the window is the last 15 minutes", () => {
    const now = new Date("2026-10-29T12:00:00.000Z");
    expect(attemptWindowStart(now).toISOString()).toBe("2026-10-29T11:45:00.000Z");
  });

  it("AC4: 5 failures for an email, 20 from an IP or 5 on a link refuse the next attempt", () => {
    expect(attemptsExhausted(none)).toBe(false);
    expect(attemptsExhausted({ ...none, email: 4 })).toBe(false);
    expect(attemptsExhausted({ ...none, email: 5 })).toBe(true);
    expect(attemptsExhausted({ ...none, ip: 19 })).toBe(false);
    expect(attemptsExhausted({ ...none, ip: 20 })).toBe(true);
    expect(attemptsExhausted({ ...none, invitation: 4 })).toBe(false);
    expect(attemptsExhausted({ ...none, invitation: 5 })).toBe(true);
    expect(ATTEMPT_LIMITS).toEqual({ email: 5, ip: 20, invitation: 5 });
  });

  it("an email is counted however it was typed", () => {
    expect(attemptEmail("  Ana@Lab.TEST ")).toBe("ana@lab.test");
  });

  it("the refusal says nothing about whether the email has an account", () => {
    expect(TOO_MANY_ATTEMPTS).toBe("Too many attempts. Try again in 15 minutes.");
  });
});
