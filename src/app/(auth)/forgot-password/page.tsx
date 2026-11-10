"use client";

import { startTransition, useActionState } from "react";
import Link from "next/link";
import { HumanCheck, useHumanCheck } from "@/components/auth/HumanCheck";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "./actions";
import { EMPTY_FORGOT_PASSWORD_STATE } from "./state";

/**
 * Forgot-password form (14zcqntjnt9).
 *
 * Always shows the same confirmation once an email is submitted, whether or not an account
 * exists, so the page never reveals who has an account. Serves both console admins and
 * medtechs (who sign in to the mobile app with the same account).
 */
export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    EMPTY_FORGOT_PASSWORD_STATE,
  );
  const check = useHumanCheck();

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-stone-mid uppercase">
          AgarthaVision
        </p>
        <h1 className="text-[26px] leading-8 font-bold text-stone-ink">Reset your password</h1>
        <p className="text-[13px] text-stone-mid">
          Enter your email address. Works for both console admins and medtechs on the mobile app.
        </p>
      </div>

      <Card>
        <CardContent>
          {state.sent ? (
            <div className="flex flex-col gap-4 text-[14px] text-stone-deep">
              <p role="status">
                If an account exists for that email, we sent a password reset link. Check your inbox
                and open the link to set a new password.
              </p>
              <p className="text-[13px] text-stone-mid">
                <Link href="/login" className="font-medium text-teal hover:underline">
                  Back to sign in
                </Link>
              </p>
            </div>
          ) : (
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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" name="email" autoComplete="email" required />
              </div>

              <HumanCheck check={check} action="forgot-password" />

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
                {pending ? "Sending…" : "Send reset link"}
              </Button>

              <p className="text-center text-[13px] text-stone-mid">
                <Link href="/login" className="font-medium text-teal hover:underline">
                  Back to sign in
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
