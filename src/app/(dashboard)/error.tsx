"use client";

import { Button } from "@/components/ui/button";

/**
 * The console's error boundary. A failed read below the layout lands here
 * instead of on the framework's bare error page: the shell stays, the visitor
 * is told the read failed, and retry re-renders the page. The message is not
 * shown — it may carry database detail — only the digest the server logged.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="text-[20px] font-bold text-stone-ink">This page could not be loaded</h1>
      <p className="mt-3 text-[14px] text-stone-deep">
        The data behind it could not be read. Try again; if it keeps failing, the reference below
        helps trace it.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-[12px] text-stone-mid">Reference: {error.digest}</p>
      ) : null}
      <Button className="mt-6" variant="outline" onClick={() => reset()}>
        Try again
      </Button>
    </main>
  );
}
