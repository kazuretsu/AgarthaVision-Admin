import { DatabaseReadError } from "@/ports/db";

/**
 * PostgREST caps every response at the project's `db-max-rows` — 1000 by default
 * on Supabase — whatever `.limit()` asks for, and says nothing when it does. A
 * read that needs more than one response's worth must page, or it silently comes
 * back short and a "more than N" check built on its length can never fire.
 *
 * Pages are requested this size. Asking for more than the server cap is harmless:
 * the page simply comes back short and the next one starts where it ended.
 */
export const PAGE_SIZE = 1000;

export interface PageResult {
  data: unknown[] | null;
  error: unknown;
}

/**
 * Reads up to `limit` rows by calling `page(from, to)` — an inclusive `.range()`
 * over a query with a total order — until a page comes back empty or `limit` is
 * reached.
 *
 * A short page is not taken as the end, because the server cap may be below
 * {@link PAGE_SIZE}; only an empty page is. Offsets can shift if rows are
 * inserted between pages; with a newest-first order that repeats a row rather
 * than skipping one, so rows are de-duplicated on `keyOf`.
 */
export async function readPages<T>(
  operation: string,
  limit: number,
  page: (from: number, to: number) => PromiseLike<PageResult>,
  keyOf: (row: T) => string,
): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  let offset = 0;

  while (rows.length < limit) {
    const from = offset;
    const to = from + Math.min(PAGE_SIZE, limit - rows.length) - 1;
    const { data, error } = await page(from, to);
    if (error) throw new DatabaseReadError(operation, error);

    const batch = (data ?? []) as T[];
    if (batch.length === 0) break;
    offset += batch.length;

    for (const row of batch) {
      const key = keyOf(row);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
      if (rows.length === limit) break;
    }
  }
  return rows;
}
