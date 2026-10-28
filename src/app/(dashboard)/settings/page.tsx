import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuth } from "@/adapters/registry";
import { AuthUnavailableError, NotAuthenticatedError, NotAuthorizedError } from "@/ports/auth";
import { ANY_CONSOLE_USER, requirePageAccess } from "@/lib/console-access";
import { markUnavailable } from "@/lib/unavailable";
import { AuthenticatorSetUp, AuthenticatorTurnOff } from "@/components/auth/SecondFactor";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The signed-in admin's own settings (14zcqntr31c). For now one card: two-step sign-in, which
 * each admin turns on when they have an authenticator app, and off again with a code from it.
 * Nobody sees or changes anyone else's here; a super admin resets an org admin's app from that
 * person's People page.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Settings · AgarthaVision Admin" };

export default async function SettingsPage() {
  await requirePageAccess(ANY_CONSOLE_USER);

  let hasAuthenticator: boolean;
  try {
    // Read from the auth server, not the session: an app reset since this session passed its
    // code shows as off.
    ({ hasAuthenticator } = await (await getAuth()).secondFactorStatus());
  } catch (cause) {
    if (cause instanceof NotAuthenticatedError) redirect("/login");
    if (cause instanceof NotAuthorizedError) redirect("/dashboard");
    if (cause instanceof AuthUnavailableError) throw markUnavailable(cause);
    throw cause;
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-[22px] font-bold text-stone-ink">Settings</h1>
        <p className="text-[13px] text-stone-mid">How you sign in to the console.</p>
      </header>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Two-step sign-in</CardTitle>
            <Badge variant={hasAuthenticator ? "ok" : "neutral"}>
              {hasAuthenticator ? "On" : "Off"}
            </Badge>
          </div>
          <CardDescription>
            {hasAuthenticator
              ? "Every sign-in asks for your password and then a 6-digit code from your authenticator app."
              : "Add a 6-digit code from an authenticator app (such as Google Authenticator, Microsoft Authenticator or 1Password) to every sign-in, so a password alone cannot open your account. Your account can read patients' records, so we recommend it."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {hasAuthenticator ? <AuthenticatorTurnOff /> : <AuthenticatorSetUp />}
          <p className="text-[12px] text-stone-mid">
            {hasAuthenticator
              ? "Changing phones? Turn it off here with a code from the old one, then set it up again. Lost your phone? Ask an AgarthaVision super admin to reset it."
              : "If you also use the AgarthaVision mobile app with this account, it will ask you to sign in again once you turn this on."}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
