/**
 * Redirect target for a successful sign-in, and proof the admin gate in the
 * segment layout admits the right people. The summary cards, EPG trend and
 * severity split replace this body in the next commit.
 */
export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <h1 className="text-[22px] font-bold text-stone-ink">Dashboard</h1>
      <p className="mt-2 max-w-prose text-[14px] text-stone-deep">
        You are signed in as an administrator. Only human-validated records count toward official
        aggregation; pending and flagged samples are excluded.
      </p>
    </main>
  );
}
