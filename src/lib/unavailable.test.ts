import { describe, expect, it } from "vitest";
import { markUnavailable, unavailableReference } from "./unavailable";

describe("outage digest (14zcqntk6h2)", () => {
  it("marks an error with a reference the boundaries recognise", () => {
    const error = markUnavailable(new Error("down"));
    expect(unavailableReference(error.digest)).toMatch(/^[0-9a-f]{8}$/);
  });

  it("keeps the first reference when the same error is thrown again", () => {
    const error = markUnavailable(new Error("down"));
    const first = error.digest;
    expect(markUnavailable(error).digest).toBe(first);
  });

  it.each([
    [undefined],
    ["1234567890"],
    ["NEXT_HTTP_ERROR_FALLBACK;404"],
    ["CONSOLE_UNAVAILABLE-"],
  ])("does not read %s as an outage", (digest) => {
    expect(unavailableReference(digest)).toBeNull();
  });
});
