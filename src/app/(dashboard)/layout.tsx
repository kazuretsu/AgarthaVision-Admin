import Link from "next/link";
import { redirect } from "next/navigation";
import { accessLabel } from "@/domain/access";
import { NotAuthenticatedError, NotAuthorizedError } from "@/ports/auth";
import { MissingEnvironmentError } from "@/lib/env";
import { getConsoleActor } from "@/lib/console-access";
import { navFor } from "@/components/shell/nav";
import { SidebarNav } from "@/components/shell/SidebarNav";
import { UserMenu } from "@/components/shell/UserMenu";
import { Button } from "@/components/ui/button";
import { signOut } from "../(auth)/login/actions";

/**
 * The console gate and shell.
 *
 * Every route in this segment is guarded here, once. Putting the check in the
 * layout rather than in each page means a new page under `(dashboard)/` is
 * protected the moment it is created — there is no per-page opt-in to forget.
 *
 * Every page also calls `requirePageAccess()`: a client-side navigation does not
 * re-render this layout, so the page's own call is what re-reads access on each
 * click. A revoked admin loses access on their next navigation, not at token expiry.
 */
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let actor;
  try {
    actor = await getConsoleActor();
  } catch (cause) {
    if (cause instanceof NotAuthenticatedError) redirect("/login");
    if (cause instanceof NotAuthorizedError) return <NoConsoleAccess />;
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

  const items = navFor(actor.access.kind);
  const organizationName = actor.access.kind === "org_admin" ? actor.access.organizationName : null;

  // Desktop only: super admins and organization admins work at a computer, and
  // medtechs use the mobile app. A narrower window scrolls sideways instead of
  // rearranging the console.
  return (
    <div className="flex min-h-full min-w-[1024px]">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col gap-6 border-r border-stone-hair bg-surface px-3 py-5">
        <Link href="/dashboard" className="px-3 text-[14px] font-bold text-stone-ink">
          AgarthaVision <span className="font-medium text-stone-mid">Admin</span>
        </Link>
        <SidebarNav items={items} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-stone-hair bg-surface px-6 py-2">
          {organizationName ? (
            <span className="text-[13px] font-semibold text-stone-deep">{organizationName}</span>
          ) : (
            <span className="text-[13px] text-stone-mid">All organizations</span>
          )}
          <div className="ml-auto">
            <UserMenu
              name={actor.user.fullName ?? actor.user.email ?? "Signed in"}
              roleLabel={accessLabel(actor.access)}
              organizationName={organizationName}
              signOutAction={signOut}
            />
          </div>
        </header>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}

/**
 * What a signed-in person without console access sees: where to go instead, and
 * a way out. No data and no navigation. Usually a medtech; it is also what a
 * deactivated organization admin sees, so it does not assume which.
 */
function NoConsoleAccess() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-[20px] font-bold text-stone-ink">
        This console is for super admins and organization admins
      </h1>
      <p className="text-[14px] text-stone-deep">
        Medtechs use the AgarthaVision mobile app with the same email and password. If you manage a
        laboratory, ask an AgarthaVision super admin to check your access.
      </p>
      <form action={signOut}>
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </main>
  );
}
