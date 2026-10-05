/**
 * Stands in for a page's frames while they are signed. Record pages render it as
 * a Suspense fallback below their not-found check, so a missing record still
 * answers 404 and an existing one shows its figures at once.
 */
export function FramesFallback({ count = 1, columns = 1 }: { count?: number; columns?: number }) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading frames…</span>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="aspect-[4/3] w-full animate-pulse rounded-[10px] bg-stone-hair"
        />
      ))}
    </div>
  );
}
