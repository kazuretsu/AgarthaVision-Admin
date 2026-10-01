/**
 * Shown while a records page reads. A patient's sessions or a session's frames
 * can take a moment to read and sign; without this the previous page simply
 * stays on screen with no sign the click registered.
 */
export default function RecordsLoading() {
  return (
    <main
      className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-10"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading records…</span>
      <div className="h-6 w-48 animate-pulse rounded-[6px] bg-stone-hair" />
      <div className="h-4 w-80 animate-pulse rounded-[6px] bg-stone-hair" />
      <div className="mt-4 h-64 w-full animate-pulse rounded-[12px] bg-stone-hair" />
    </main>
  );
}
