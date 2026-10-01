import { describe, expect, it } from "vitest";
import { DatabaseReadError } from "@/ports/db";
import { PAGE_SIZE, readPages } from "./paging";

interface Row {
  id: string;
}

/** A table of `total` rows behind a server that returns at most `cap` per response. */
function server(total: number, cap: number) {
  const table: Row[] = Array.from({ length: total }, (_, index) => ({ id: `row-${index}` }));
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: table.slice(from, Math.min(to + 1, from + cap)), error: null };
  };
  return { table, calls, page };
}

const id = (row: Row) => row.id;

describe("readPages", () => {
  it("reads past a server cap that a single .limit() cannot raise", async () => {
    const { page } = server(2500, 1000);
    const rows = await readPages<Row>("test", 5000, page, id);
    expect(rows).toHaveLength(2500);
    expect(rows.at(-1)).toEqual({ id: "row-2499" });
  });

  it("keeps going when the server cap is below the page size", async () => {
    const { page } = server(1200, 250);
    const rows = await readPages<Row>("test", 5000, page, id);
    expect(rows).toHaveLength(1200);
  });

  it("stops at the limit, so limit + 1 can detect that more exist", async () => {
    const { page, calls } = server(7000, 1000);
    const rows = await readPages<Row>("test", 5001, page, id);
    expect(rows).toHaveLength(5001);
    expect(calls.at(-1)).toEqual([5000, 5000]);
  });

  it("asks for no more than one page at a time", async () => {
    const { page, calls } = server(3000, 5000);
    await readPages<Row>("test", 3000, page, id);
    for (const [from, to] of calls) expect(to - from + 1).toBeLessThanOrEqual(PAGE_SIZE);
  });

  it("returns nothing for an empty table, in one request", async () => {
    const { page, calls } = server(0, 1000);
    expect(await readPages<Row>("test", 5000, page, id)).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("drops a row repeated because an insert shifted the offsets", async () => {
    let call = 0;
    const page = async () => {
      call += 1;
      if (call === 1) return { data: [{ id: "a" }, { id: "b" }], error: null };
      if (call === 2) return { data: [{ id: "b" }, { id: "c" }], error: null };
      return { data: [], error: null };
    };
    const rows = await readPages<Row>("test", 10, page, id);
    expect(rows.map(id)).toEqual(["a", "b", "c"]);
  });

  it("throws a DatabaseReadError naming the operation", async () => {
    const page = async () => ({ data: null, error: { message: "boom" } });
    await expect(readPages<Row>("listSmears", 10, page, id)).rejects.toBeInstanceOf(
      DatabaseReadError,
    );
  });
});
