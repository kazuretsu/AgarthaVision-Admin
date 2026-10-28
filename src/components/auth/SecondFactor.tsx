"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { verifyCode } from "@/app/(auth)/verify/actions";
import { EMPTY_VERIFY_STATE } from "@/app/(auth)/verify/state";
import { setUpAuthenticator, turnOffAuthenticator } from "@/app/(dashboard)/settings/actions";
import { EMPTY_SET_UP_STATE, EMPTY_TURN_OFF_STATE } from "@/app/(dashboard)/settings/state";
import { SECOND_FACTOR_CODE_FIELD } from "@/domain/second-factor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The authenticator forms: entering its code at sign-in (14zcqntjnt0), and setting one up or
 * turning it off on `/settings` (14zcqntr31c). Composed from the shadcn primitives; the server
 * actions do the work.
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

/** Settings: show a QR code, then confirm the app with its first code. */
export function AuthenticatorSetUp() {
  const [state, action, pending] = useActionState(setUpAuthenticator, EMPTY_SET_UP_STATE);
  const { setUp } = state;

  if (!setUp) {
    return (
      <form action={action} className="flex flex-col gap-4">
        <Problem message={state.error} />
        <Button type="submit" className="w-fit" disabled={pending}>
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
      <Button type="submit" className="w-fit" disabled={pending}>
        {pending ? "Checking…" : "Turn on"}
      </Button>
    </form>
  );
}

/** Sign-in: the code from the app already set up. */
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

/** Settings: turning the app off takes a code from it, so an open session alone cannot. */
export function AuthenticatorTurnOff() {
  const [state, action, pending] = useActionState(turnOffAuthenticator, EMPTY_TURN_OFF_STATE);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="outline" className="w-fit" onClick={() => setOpen(true)}>
        Turn off
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <p className="text-[13px] text-stone-deep">
        Enter the code your app shows now to turn two-step sign-in off. After that, signing in needs
        only your password.
      </p>
      <CodeField autoFocus />
      <Problem message={state.error} />
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? "Turning off…" : "Turn off two-step sign-in"}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
