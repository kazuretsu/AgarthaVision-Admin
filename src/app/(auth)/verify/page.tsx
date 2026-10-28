import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuth } from "@/adapters/registry";
import { AuthUnavailableError, NotAuthenticatedError, NotAuthorizedError } from "@/ports/auth";
import { MissingEnvironmentError } from "@/lib/env";
import { markUnavailable } from "@/lib/unavailable";
import { AuthenticatorCode } from "@/components/auth/SecondFactor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { signOut } from "../login/actions";

/**
 * The second step of signing in (14zcqntjnt0). Outside the `(dashboard)` gate, which sends an
 * admin with an authenticator app here until they enter its code. Nothing of the console renders
 * here. An admin without an app has nothing to enter and goes on: setting one up is their
 * choice, on `/settings` (14zcqntr31c).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Authenticator code · AgarthaVision",
  robots: { index: false, follow: false },
};

export default async function VerifyPage() {
  let status;
  try {
    status = await (await getAuth()).secondFactorStatus();
  } catch (cause) {
    if (cause instanceof NotAuthenticatedError) redirect("/login");
    // A medtech is never asked for a code: the console gate tells them where to go.
    if (cause instanceof NotAuthorizedError) redirect("/dashboard");
    if (cause instanceof MissingEnvironmentError) redirect("/login");
    if (cause instanceof AuthUnavailableError) throw markUnavailable(cause);
    throw cause;
  }
  if (status.step !== "enter_code") redirect("/dashboard");

  const { user } = status.actor;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-stone-mid uppercase">
          AgarthaVision
        </p>
        <h1 className="text-[26px] leading-8 font-bold text-stone-ink">Enter your code</h1>
        <p className="text-[13px] text-stone-mid">
          Open your authenticator app and enter the 6-digit code for AgarthaVision Admin.
        </p>
      </div>

      <Card>
        <CardContent>
          <AuthenticatorCode />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 text-[12px] text-stone-mid">
        <p>
          If you also use the AgarthaVision mobile app with this account, it will ask you to sign in
          again afterwards.
        </p>
        <p>Lost your phone? Ask an AgarthaVision super admin to reset your authenticator app.</p>
        <form action={signOut} className="flex items-center justify-between gap-3">
          <span className="truncate">Signed in as {user.email ?? "your account"}</span>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
