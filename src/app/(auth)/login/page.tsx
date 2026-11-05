"use client";

import { Suspense, startTransition, useActionState } from "react";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { HumanCheck, useHumanCheck } from "@/components/auth/HumanCheck";
import { SessionEndedNotice } from "@/components/auth/SessionEndedNotice";
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
 *
 * The form is submitted from `onSubmit` rather than through `action`, because React resets a
 * form once its action finishes: a failed sign-in would clear the email and password. Here the
 * browser keeps what was typed, so a typo can be fixed in place (14zcqntr8m4); the password is
 * never sent back to refill it. `action` stays for the server-rendered form: submitted before
 * the scripts load, it posts to the server action, never a GET with the credentials in the URL.
 */
export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, EMPTY_LOGIN_STATE);
  const check = useHumanCheck();

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-stone-mid uppercase">
          AgarthaVision
        </p>
        <h1 className="text-[26px] leading-8 font-bold text-stone-ink">Admin Console</h1>
        <p className="text-[13px] text-stone-mid">
          For super admins and organization admins. Medtechs use the mobile app.
        </p>
      </div>

      <Card>
        <CardContent>
          <form
            action={formAction}
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              check.consume();
              startTransition(() => formAction(formData));
            }}
            className="flex flex-col gap-4"
          >
            {state.error ? null : (
              <Suspense fallback={null}>
                <SessionEndedNotice />
              </Suspense>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" name="email" autoComplete="username" required />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="current-password"
                required
              />
            </div>

            <HumanCheck check={check} action="sign-in" />

            {state.error ? (
              <p role="alert" className="text-[13px] text-maroon">
                {state.error}
              </p>
            ) : null}

            <Button
              type="submit"
              size="lg"
              disabled={pending || (check.required && !check.token)}
              className="mt-2"
            >
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
