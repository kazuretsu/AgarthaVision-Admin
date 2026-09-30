"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "./actions";
import { EMPTY_LOGIN_STATE } from "./state";

/**
 * Sign-in form.
 *
 * A client component only because it needs the pending state; the credentials
 * themselves are handled entirely by the server action, so no key and no
 * provider SDK reaches the browser from this route.
 */
export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, EMPTY_LOGIN_STATE);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-stone-mid uppercase">
          AgarthaVision
        </p>
        <h1 className="text-[26px] leading-8 font-bold text-stone-ink">Admin Console</h1>
        <p className="text-[13px] text-stone-mid">
          For laboratory administrators. Medical technologists use the Android app.
        </p>
      </div>

      <Card>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" name="email" autoComplete="username" required />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                name="password"
                autoComplete="current-password"
                required
              />
            </div>

            {state.error ? (
              <p role="alert" className="text-[13px] text-maroon">
                {state.error}
              </p>
            ) : null}

            <Button type="submit" size="lg" disabled={pending} className="mt-2">
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
