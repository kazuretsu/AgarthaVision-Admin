"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Circle } from "lucide-react";
import { PASSWORD_RULES, passwordGaps } from "@/domain/password-policy";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Label } from "@/components/ui/label";

/**
 * A new password and its confirmation, with the provider's rules ticked off as they are met
 * (14zcqntr31d), for the invitation form and Settings (14zcqntr35e). The checklist is not a
 * gate on the button: an account that already exists signs in on the invitation form with the
 * password it has, and the provider has the last word either way.
 */
export function NewPasswordFields({
  id,
  name = "password",
  label = "Password",
}: {
  /** Prefix for the fields' ids, unique on the page. */
  id: string;
  /** The new password's form field; its confirmation is always `confirmPassword`. */
  name?: string;
  label?: string;
}) {
  // What is typed, for the checklist. React resets the form after each submission, so the
  // checklist resets with it.
  const [password, setPassword] = useState("");
  const missed = new Set(passwordGaps(password));
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const form = field.current?.form;
    if (!form) return;
    const reset = () => setPassword("");
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, []);

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-password`}>{label}</Label>
        <PasswordInput
          ref={field}
          id={`${id}-password`}
          name={name}
          autoComplete="new-password"
          aria-describedby={`${id}-password-rules`}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {/* The provider's rules (password-policy.ts). */}
        <ul id={`${id}-password-rules`} className="flex flex-col gap-1 text-[12px]">
          {PASSWORD_RULES.map(({ rule, label: ruleLabel }) => {
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
                {ruleLabel}
                <span className="sr-only">{met ? "(met)" : "(not yet)"}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-confirm`}>Confirm {label.toLowerCase()}</Label>
        <PasswordInput
          id={`${id}-confirm`}
          name="confirmPassword"
          autoComplete="new-password"
          required
        />
      </div>
    </>
  );
}
