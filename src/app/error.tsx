"use client";

import { Button } from "@/components/ui/button";
import { ConsoleUnavailable } from "@/components/shell/ConsoleUnavailable";
import { unavailableReference } from "@/lib/unavailable";

/**
 * The boundary above the console's layout. The `(dashboard)` layout reads access before it
 * draws the shell, so when that read fails (14zcqntk6h2) there is no shell to show an error
 * in: the error lands here, the page answers 500, and nothing from the console is rendered.
 * Anything else that fails this high gets the same plain message as a page would.
 */
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const outage = unavailableReference(error.digest);
  if (outage) return <ConsoleUnavailable reference={outage} onRetry={retry} />;
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="text-[20px] font-bold text-stone-ink">This page could not be loaded</h1>
      <p className="mt-3 text-[14px] text-stone-deep">
        Something went wrong on the server. Try again; if it keeps failing, the reference below
        helps trace it.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-[12px] text-stone-mid">Reference: {error.digest}</p>
      ) : null}
      <Button className="mt-6" variant="outline" onClick={() => retry()}>
        Try again
      </Button>
    </main>
  );
}
