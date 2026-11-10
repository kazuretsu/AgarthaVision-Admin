"use client";

import { useActionState } from "react";
import Link from "next/link";
import { NewPasswordFields } from "@/components/auth/NewPasswordFields";
import { Button } from "@/components/ui/button";
import { resetPassword } from "@/app/(auth)/reset-password/actions";
import { EMPTY_RESET_PASSWORD_STATE } from "@/app/(auth)/reset-password/state";

/**
 * Sets a new password from a single-use recovery link (14zcqntjnt9).
 *
 * Carries the link's `code` or `tokenHash` as hidden fields and checks the new password rules
 * before consuming the link. After resetting, console admins sign in at `/login` (and pass
 * `/verify` when an authenticator app is enabled) while medtechs sign in to the mobile app.
 */
export function ResetPasswordForm({ code, tokenHash }: { code?: string; tokenHash?: string }) {
  const [state, formAction, pending] = useActionState(resetPassword, EMPTY_RESET_PASSWORD_STATE);

  if (state.done) {
    return (
      <div className="flex flex-col gap-4 text-[14px] text-stone-deep">
        <p role="status" className="font-medium text-stone-ink">
          Your password has been reset.
        </p>
        <p className="text-[13px] text-stone-mid">
          Super admins and organization admins can now sign in to the console with the new password.
          Medtechs can sign in to the AgarthaVision mobile app with the new password.
        </p>
        <p className="text-[13px]">
          <Link href="/login" className="font-medium text-teal hover:underline">
            Sign in to the console
          </Link>
        </p>
      </div>
    );
  }

  if (state.linkInvalid) {
    return (
      <div className="flex flex-col gap-3 text-[14px] text-stone-deep">
        <p role="alert">{state.error}</p>
        <p className="text-[13px] text-stone-mid">
          <Link href="/forgot-password" className="font-medium text-teal hover:underline">
            Request a new reset link
          </Link>
          {" · "}
          <Link href="/login" className="font-medium text-teal hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="code" value={code ?? ""} />
      <input type="hidden" name="tokenHash" value={tokenHash ?? ""} />

      <NewPasswordFields id="reset" label="New password" />

      {state.error ? (
        <div className="flex flex-col gap-1.5">
          <p role="alert" className="text-[13px] text-maroon">
            {state.error}
          </p>
          <p className="text-[12px] text-stone-mid">
            <Link href="/forgot-password" className="font-medium text-teal hover:underline">
              Request a new reset link
            </Link>
          </p>
        </div>
      ) : null}

      <Button type="submit" size="lg" disabled={pending} className="mt-2">
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
