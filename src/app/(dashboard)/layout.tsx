import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth } from "@/adapters/registry";
import { NotAuthenticatedError, NotAuthorizedError } from "@/ports/auth";
import { MissingEnvironmentError } from "@/lib/env";
import { signOut } from "../(auth)/login/actions";

/**
 * The admin gate.
 *
 * Every route in this segment is guarded here, once. Putting the check in the
 * layout rather than in each page means a new page under `(dashboard)/` is
 * protected the moment it is created — there is no per-page opt-in to forget.
 *
 * `requireAdmin()` reads `profiles.role` server-side on every request, so a
 * revoked admin loses access on their next navigation rather than whenever
 * their token happens to expire.
 */
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let user;
  try {
    user = await (await getAuth()).requireAdmin();
  } catch (cause) {
    if (cause instanceof NotAuthenticatedError || cause instanceof NotAuthorizedError) {
      redirect("/login");
    }
    if (cause instanceof MissingEnvironmentError) {
      // A misconfigured server is not an authorisation failure — say so plainly
      // instead of bouncing the operator to a login form that cannot work.
      return (
        <main className="mx-auto w-full max-w-2xl px-6 py-16">
          <h1 className="text-[20px] font-bold text-stone-ink">Server not configured</h1>
          <p className="mt-3 text-[14px] text-stone-deep">
            <code className="font-mono text-[13px]">{cause.variable}</code> is not set. Copy{" "}
            <code className="font-mono text-[13px]">.env.example</code> to{" "}
            <code className="font-mono text-[13px]">.env.local</code> and fill it in.
          </p>
        </main>
      );
    }
    throw cause;
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-stone-hair bg-surface">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-6 py-3">
          <Link href="/dashboard" className="text-[14px] font-bold text-stone-ink">
            AgarthaVision <span className="font-medium text-stone-mid">Admin</span>
          </Link>
          <nav className="flex items-center gap-4 text-[13px]">
            <Link href="/dashboard" className="text-stone-deep hover:text-maroon">
              Dashboard
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[12px] text-stone-mid">{user.fullName ?? user.email}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-[12px] font-medium text-stone-deep hover:text-maroon"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
