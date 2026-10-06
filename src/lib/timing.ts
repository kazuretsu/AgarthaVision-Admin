import { optionalEnv } from "./env";

/**
 * Server-side timing (14zcqntkd0y): how long the access check and each read or write
 * took, one log line per call, so a claim like "at most two round trips before data" can
 * be checked on the real deployment (Vercel → Logs) rather than argued.
 *
 * A line names the operation and its milliseconds — `[timing] db.listPeople 84ms` —
 * and nothing else: no user, no record id, no argument. `CONSOLE_TIMING=off` silences it.
 */

function enabled(): boolean {
  return optionalEnv("CONSOLE_TIMING", "on").trim().toLowerCase() !== "off";
}

export function logTiming(name: string, milliseconds: number): void {
  if (enabled()) console.info(`[timing] ${name} ${Math.round(milliseconds)}ms`);
}

/** Runs `run`, then logs how long it took under `name`, whether it resolved or threw. */
export async function timed<T>(name: string, run: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await run();
  } finally {
    logTiming(name, performance.now() - start);
  }
}

/**
 * The same port, with every method call timed as `<prefix>.<method>`. The registry
 * wraps each port it hands out, so no adapter or caller changes to be measured.
 */
export function timedPort<T extends object>(prefix: string, port: T): T {
  return new Proxy(port, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function" || typeof property !== "string") return value;
      return (...args: unknown[]) => {
        const start = performance.now();
        const result: unknown = value.apply(target, args);
        if (result instanceof Promise) {
          return result.finally(() =>
            logTiming(`${prefix}.${property}`, performance.now() - start),
          );
        }
        logTiming(`${prefix}.${property}`, performance.now() - start);
        return result;
      };
    },
  });
}
