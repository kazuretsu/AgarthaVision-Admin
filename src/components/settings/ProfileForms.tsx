"use client";

import { useActionState, useRef, useState } from "react";
import { changeOwnPassword, renameSelf } from "@/app/(dashboard)/settings/actions";
import { EMPTY_PROFILE_FORM } from "@/app/(dashboard)/settings/state";
import { PROFILE_NAME_MAX } from "@/domain/profile";
import { NewPasswordFields } from "@/components/auth/NewPasswordFields";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Feedback } from "@/components/invitations/InvitationForms";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The signed-in admin's own name and password on `/settings` (14zcqntr35e). Composed from the
 * shadcn primitives; the server actions do the work and the database records it.
 */

/** The name the console shows for them. The email is shown, not editable. */
export function NameForm({ email, fullName }: { email: string | null; fullName: string | null }) {
  const [state, action, pending] = useActionState(renameSelf, EMPTY_PROFILE_FORM);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-email">Email</Label>
        <Input id="profile-email" value={email ?? ""} readOnly disabled />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-name">Name</Label>
        <Input
          id="profile-name"
          name="fullName"
          defaultValue={fullName ?? ""}
          maxLength={PROFILE_NAME_MAX}
          autoComplete="name"
          required
        />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Feedback {...state} />
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save name"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Current, new and confirmed password. Sending it signs out every other session, the mobile
 * app's included, so it asks first; the fields are checked before the question is asked.
 */
export function PasswordForm() {
  const [state, action, pending] = useActionState(changeOwnPassword, EMPTY_PROFILE_FORM);
  const [confirming, setConfirming] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  return (
    <form ref={form} action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password-current">Current password</Label>
        <PasswordInput
          id="password-current"
          name="currentPassword"
          autoComplete="current-password"
          required
        />
      </div>

      <NewPasswordFields id="password-new" name="newPassword" label="New password" />

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Feedback {...state} />
        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            if (form.current?.reportValidity()) setConfirming(true);
          }}
        >
          {pending ? "Changing…" : "Change password"}
        </Button>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogTitle>Change your password?</AlertDialogTitle>
          <AlertDialogDescription>
            This signs you out of every other session, including the AgarthaVision mobile app and
            any other browser. You stay signed in here. Sign in again elsewhere with the new
            password.
          </AlertDialogDescription>
          <div className="mt-2 flex justify-end gap-2">
            <AlertDialogClose className={buttonVariants({ variant: "ghost" })}>
              Cancel
            </AlertDialogClose>
            <AlertDialogClose
              className={buttonVariants({ variant: "default" })}
              onClick={() => form.current?.requestSubmit()}
            >
              Change password and sign out elsewhere
            </AlertDialogClose>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
