"use client";

import { Button } from "@/components/ui/button";

/**
 * What a console page shows when its data cannot be reached (14zcqntk6h2): no data, no
 * database detail, a reference to trace it by and a retry that asks the server again.
 * Not "no access": nothing was refused, and nothing was granted either.
 */
export function ConsoleUnavailable({
  reference,
  onRetry,
}: {
  reference: string | null;
  onRetry: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16" data-testid="console-unavailable">
      <h1 className="text-[20px] font-bold text-stone-ink">
        The console can&apos;t reach its data right now
      </h1>
      <p className="mt-3 text-[14px] text-stone-deep">
        Nothing about your access has changed. Try again in a moment; if it keeps failing, the
        reference below helps trace it.
      </p>
      {reference ? (
        <p className="mt-2 font-mono text-[12px] text-stone-mid">Reference: {reference}</p>
      ) : null}
      <Button className="mt-6" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </main>
  );
}
