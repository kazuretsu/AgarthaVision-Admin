/** What a records page shows when the server has no database configured. */
export function DataUnavailable({ title, variable }: { title: string; variable: string }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <h1 className="text-[22px] font-bold text-stone-ink">{title}</h1>
      <p className="mt-3 text-[14px] text-stone-deep">
        <code className="font-mono text-[13px]">{variable}</code> is not set, so no records could be
        read.
      </p>
    </main>
  );
}
