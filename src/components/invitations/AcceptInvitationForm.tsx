"use client";

import { useActionState } from "react";
import { acceptInvitation } from "@/app/(auth)/invite/[token]/actions";
import { EMPTY_ACCEPT_STATE } from "@/app/(auth)/invite/[token]/state";
import { HumanCheck, useHumanCheck } from "@/components/auth/HumanCheck";
import { PASSWORD_MIN, invitedToConsole, type InvitedRole } from "@/domain/invitations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Name and password for a new account. The email is shown, not editable: the
 * account is made for the address the invitation was sent to, whatever a form
 * says. No password ever travels by email.
 */
export function AcceptInvitationForm({
  token,
  email,
  fullName,
  role,
}: {
  token: string;
  email: string;
  fullName: string | null;
  role: InvitedRole;
}) {
  const [state, action, pending] = useActionState(acceptInvitation, EMPTY_ACCEPT_STATE);
  const check = useHumanCheck();

  return (
    <form
      action={(formData) => {
        check.consume();
        action(formData);
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="token" value={token} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="accept-email">Email</Label>
        <Input id="accept-email" value={email} readOnly disabled autoComplete="username" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="accept-name">Your name</Label>
        <Input
          id="accept-name"
          name="fullName"
          defaultValue={state.fullName ?? fullName ?? ""}
          maxLength={120}
          autoComplete="name"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="accept-password">Password</Label>
        <Input
          id="accept-password"
          name="password"
          type="password"
          minLength={PASSWORD_MIN}
          autoComplete="new-password"
          required
        />
        <p className="text-[12px] text-stone-mid">At least {PASSWORD_MIN} characters.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="accept-confirm">Confirm password</Label>
        <Input
          id="accept-confirm"
          name="confirmPassword"
          type="password"
          minLength={PASSWORD_MIN}
          autoComplete="new-password"
          required
        />
      </div>

      <HumanCheck check={check} action="accept-invitation" />

      {state.error ? (
        <p role="alert" className="text-[13px] text-danger">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={pending || (check.required && !check.token)}
        className="mt-2"
      >
        {pending
          ? "Setting up…"
          : invitedToConsole(role)
            ? "Set password and open the console"
            : "Set password"}
      </Button>
    </form>
  );
}
