import { describe, expect, it } from "vitest";
import { pageCount, pageLinks, pageOffset, pageRange, parsePage } from "./pagination";

describe("parsePage", () => {
  it("reads a positive integer", () => {
    expect(parsePage("1")).toBe(1);
    expect(parsePage("21")).toBe(21);
  });

  it("falls back to the first page for anything else", () => {
    for (const value of ["", "0", "-2", "1.5", "abc", "2e3", "9999999"]) {
      expect(parsePage(value)).toBe(1);
    }
  });
});

describe("page arithmetic", () => {
  it("turns a page into a row offset", () => {
    expect(pageOffset(1, 50)).toBe(0);
    expect(pageOffset(3, 50)).toBe(100);
  });

  it("counts pages, with one page for an empty list", () => {
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(50, 50)).toBe(1);
    expect(pageCount(1001, 50)).toBe(21);
  });

  it("names the rows a page shows, and nothing past the end", () => {
    expect(pageRange(1, 50, 1001)).toEqual({ first: 1, last: 50 });
    expect(pageRange(21, 50, 1001)).toEqual({ first: 1001, last: 1001 });
    expect(pageRange(22, 50, 1001)).toBeNull();
    expect(pageRange(1, 50, 0)).toBeNull();
  });
});

describe("pageLinks", () => {
  it("lists every page when there are few", () => {
    expect(pageLinks(1, 1)).toEqual([1]);
    expect(pageLinks(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it("elides long gaps around the current page", () => {
    expect(pageLinks(1, 21)).toEqual([1, 2, "ellipsis", 21]);
    expect(pageLinks(6, 20)).toEqual([1, "ellipsis", 5, 6, 7, "ellipsis", 20]);
    expect(pageLinks(21, 21)).toEqual([1, "ellipsis", 20, 21]);
  });

  it("shows a single skipped page instead of an ellipsis for it", () => {
    expect(pageLinks(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
