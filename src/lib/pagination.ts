/**
 * Page arithmetic for a list read one page at a time. Pages are 1-based in the URL
 * (`?page=2`) and turned into a 0-based row offset for the read.
 */

/** A `?page=` value as a page number: a positive integer, else 1. */
export function parsePage(value: string): number {
  if (!/^[0-9]{1,6}$/.test(value)) return 1;
  const page = Number(value);
  return page >= 1 ? page : 1;
}

/** The row offset a page starts at. */
export function pageOffset(page: number, size: number): number {
  return (page - 1) * size;
}

/** How many pages `total` rows fill; at least 1, so an empty list has a page to show. */
export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size));
}

/** The 1-based row numbers a page shows, e.g. 51–100 of 1,234; `null` past the end. */
export function pageRange(
  page: number,
  size: number,
  total: number,
): { first: number; last: number } | null {
  const first = pageOffset(page, size) + 1;
  if (first > total) return null;
  return { first, last: Math.min(first + size - 1, total) };
}

/**
 * The page links to show: the first and last page, the current page and its
 * neighbours, and an ellipsis for each gap of more than one page.
 * `pageLinks(6, 20)` is `[1, "ellipsis", 5, 6, 7, "ellipsis", 20]`.
 */
export function pageLinks(page: number, count: number): (number | "ellipsis")[] {
  const shown = new Set([1, count, page - 1, page, page + 1]);
  const pages = [...shown].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
  const links: (number | "ellipsis")[] = [];
  for (const [index, n] of pages.entries()) {
    const previous = pages[index - 1];
    if (previous !== undefined && n - previous === 2) links.push(previous + 1);
    else if (previous !== undefined && n - previous > 2) links.push("ellipsis");
    links.push(n);
  }
  return links;
}
