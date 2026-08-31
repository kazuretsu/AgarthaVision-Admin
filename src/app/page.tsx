import Link from "next/link";

/**
 * Landing shell for the console. Routing into the guarded admin surfaces is
 * wired in a later pass; this page exists so the scaffold renders and builds.
 */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-mid">
        AgarthaVision
      </p>
      <h1 className="text-[32px] font-bold leading-10 text-stone-ink">Admin Console</h1>
      <p className="max-w-prose text-stone-deep">
        Cross-user surveillance reporting for soil-transmitted helminth diagnostics. Only
        human-validated records count toward official aggregation.
      </p>
      <div className="rounded-[12px] border border-stone-hair bg-surface p-5">
        <p className="text-[13px] text-stone-mid">
          The administrative dashboard and the detailed records table are added in later commits of
          this pass.
        </p>
        <Link
          className="mt-4 inline-block text-[13px] font-semibold text-maroon underline-offset-4 hover:underline"
          href="/"
        >
          Reload
        </Link>
      </div>
    </main>
  );
}
