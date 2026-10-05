import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SessionResult } from "./ResultBadge";

const shown = (summary: { fieldCount: number; isPositive: boolean }) =>
  renderToStaticMarkup(createElement(SessionResult, { summary }))
    .replace(/<[^>]+>/g, "")
    .trim();

describe("SessionResult", () => {
  it("says a session never read is not read, never negative", () => {
    expect(shown({ fieldCount: 0, isPositive: false })).toBe("Not read");
  });

  it("gives a read session its result in words", () => {
    expect(shown({ fieldCount: 2, isPositive: false })).toBe("Negative");
    expect(shown({ fieldCount: 2, isPositive: true })).toBe("Positive");
  });
});
