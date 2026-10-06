import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { timed, timedPort } from "./timing";

describe("timing (14zcqntkd0y)", () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  beforeEach(() => {
    info.mockClear();
  });
  afterEach(() => {
    delete process.env.CONSOLE_TIMING;
  });

  it("logs the operation and its milliseconds, and nothing else", async () => {
    await timed("auth.actor", async () => "ok");
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]?.[0]).toMatch(/^\[timing\] auth\.actor \d+ms$/);
  });

  it("logs a call that throws, and rethrows it", async () => {
    await expect(
      timed("db.listPeople", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(info.mock.calls[0]?.[0]).toMatch(/^\[timing\] db\.listPeople \d+ms$/);
  });

  it("wraps a port: results and `this` unchanged, one line per call named by method", async () => {
    class Port {
      private readonly rows = ["a", "b"];
      async listRows(prefix: string) {
        return this.rows.map((row) => prefix + row);
      }
    }
    const port = timedPort("db", new Port());
    expect(await port.listRows("x")).toEqual(["xa", "xb"]);
    expect(info.mock.calls.map((call: unknown[]) => String(call[0]).replace(/\d+ms$/, ""))).toEqual(
      ["[timing] db.listRows "],
    );
  });

  it("is silenced by CONSOLE_TIMING=off", async () => {
    process.env.CONSOLE_TIMING = "off";
    await timed("auth.claims", async () => null);
    expect(info).not.toHaveBeenCalled();
  });
});
