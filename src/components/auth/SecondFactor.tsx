"use client";

import Image from "next/image";
import { useActionState } from "react";
import { setUpAuthenticator, verifyCode } from "@/app/(auth)/verify/actions";
import { EMPTY_VERIFY_STATE } from "@/app/(auth)/verify/state";
import { SECOND_FACTOR_CODE_FIELD } from "@/domain/second-factor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The two forms of the second step (14zcqntjnt0): setting up an authenticator app, and
 * entering its code. Composed from the shadcn primitives; the server actions do the work.
 */

/** The six-digit field both forms share. */
function CodeField({ autoFocus }: { autoFocus?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="code">6-digit code</Label>
      <Input
        id="code"
        name={SECOND_FACTOR_CODE_FIELD}
        inputMode="numeric"
        autoComplete="one-time-code"
        // "123 456", as some apps show it, is seven characters; a pasted code may carry spaces.
        maxLength={9}
        required
        autoFocus={autoFocus}
        className="font-mono tracking-[0.2em]"
      />
    </div>
  );
}

function Problem({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-[13px] text-maroon">
      {message}
    </p>
  ) : null;
}

/** First sign-in: show a QR code, then confirm the app with its first code. */
export function AuthenticatorSetUp() {
  const [state, action, pending] = useActionState(setUpAuthenticator, EMPTY_VERIFY_STATE);
  const { setUp } = state;

  if (!setUp) {
    return (
      <form action={action} className="flex flex-col gap-4">
        <Problem message={state.error} />
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Preparing…" : "Set up authenticator app"}
        </Button>
      </form>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="setUpId" value={setUp.setUpId} />
      <ol className="flex list-decimal flex-col gap-3 pl-5 text-[13px] text-stone-deep">
        <li>
          In your authenticator app, add an account and scan this code.
          {/* White behind the code in both themes: scanners need dark on light. */}
          <span className="mt-3 block w-fit rounded-lg bg-white p-3">
            <Image
              src={setUp.qrCode}
              alt="QR code for your authenticator app"
              width={176}
              height={176}
              unoptimized
            />
          </span>
          <span className="mt-2 block text-[12px] text-stone-mid">
            Can&apos;t scan? Enter this key instead:{" "}
            <code className="font-mono text-[12px] break-all text-stone-ink select-all">
              {/* In fours, as apps show it; they accept the spaces. */}
              {setUp.secret.match(/.{1,4}/g)?.join(" ") ?? setUp.secret}
            </code>
          </span>
        </li>
        <li>Enter the 6-digit code the app now shows for AgarthaVision Admin.</li>
      </ol>
      <CodeField autoFocus />
      <Problem message={state.error} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Checking…" : "Turn on and continue"}
      </Button>
    </form>
  );
}

/** Every later sign-in: the code from the app already set up. */
export function AuthenticatorCode() {
  const [state, action, pending] = useActionState(verifyCode, EMPTY_VERIFY_STATE);
  return (
    <form action={action} className="flex flex-col gap-4">
      <CodeField autoFocus />
      <Problem message={state.error} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}
