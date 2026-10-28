"use client";

import { useActionState, useState } from "react";
import { Check, Circle } from "lucide-react";
import { acceptInvitation } from "@/app/(auth)/invite/[token]/actions";
import { EMPTY_ACCEPT_STATE } from "@/app/(auth)/invite/[token]/state";
import { PASSWORD_RULES, passwordGaps } from "@/domain/password-policy";
import { HumanCheck, useHumanCheck } from "@/components/auth/HumanCheck";
import type { MembershipRole } from "@/domain/organizations";
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
  role: MembershipRole;
}) {
  const [state, action, pending] = useActionState(acceptInvitation, EMPTY_ACCEPT_STATE);
  const check = useHumanCheck();
  // What is typed, for the checklist. React resets the form after each submission, so the
  // checklist resets with it (onReset below).
  const [password, setPassword] = useState("");
  const missed = new Set(passwordGaps(password));

  return (
    <form
      action={(formData) => {
        check.consume();
        action(formData);
      }}
      onReset={() => setPassword("")}
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
          autoComplete="new-password"
          aria-describedby="accept-password-rules"
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {/* The provider's rules (password-policy.ts). Not a gate on the button: an account that
            already exists signs in here with the password it has. */}
        <ul id="accept-password-rules" className="flex flex-col gap-1 text-[12px]">
          {PASSWORD_RULES.map(({ rule, label }) => {
            const met = !missed.has(rule);
            return (
              <li
                key={rule}
                className={`flex items-center gap-1.5 ${met ? "text-stone-ink" : "text-stone-mid"}`}
              >
                {met ? (
                  <Check aria-hidden className="size-3.5 text-ok" />
                ) : (
                  <Circle aria-hidden className="size-3.5" />
                )}
                {label}
                <span className="sr-only">{met ? "(met)" : "(not yet)"}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="accept-confirm">Confirm password</Label>
        <Input
          id="accept-confirm"
          name="confirmPassword"
          type="password"
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
          : role === "org_admin"
            ? "Set password and open the console"
            : "Set password"}
      </Button>
    </form>
  );
}
