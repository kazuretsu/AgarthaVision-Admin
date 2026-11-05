import { describe, expect, it } from "vitest";
import { HUMAN_CHECK_TOKEN_MAX, readHumanCheckToken } from "./human-check";

describe("readHumanCheckToken", () => {
  it("passes a token on, trimmed", () => {
    expect(readHumanCheckToken(" 0.abc-def ")).toBe("0.abc-def");
  });

  it("is undefined when the form sent nothing", () => {
    expect(readHumanCheckToken(null)).toBeUndefined();
    expect(readHumanCheckToken("")).toBeUndefined();
    expect(readHumanCheckToken("   ")).toBeUndefined();
  });

  it("is undefined for anything that cannot be a token", () => {
    expect(readHumanCheckToken(new Blob(["x"]))).toBeUndefined();
    expect(readHumanCheckToken("x".repeat(HUMAN_CHECK_TOKEN_MAX + 1))).toBeUndefined();
  });

  it("accepts the longest token the service issues", () => {
    expect(readHumanCheckToken("x".repeat(HUMAN_CHECK_TOKEN_MAX))).toHaveLength(
      HUMAN_CHECK_TOKEN_MAX,
    );
  });
});
