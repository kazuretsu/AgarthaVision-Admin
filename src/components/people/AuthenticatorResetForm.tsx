"use client";

import { useActionState, useRef } from "react";
import { resetAuthenticator } from "@/app/(dashboard)/people/actions";
import { EMPTY_MEMBER_FORM } from "@/app/(dashboard)/people/state";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";

/**
 * A super admin resets an org admin's authenticator app behind a confirmation (14zcqntjnt0):
 * for a lost or replaced phone. Recorded in the audit trail.
 *
 * Rendered whether or not an app is set up, with the button only when there is one, so the
 * confirmation stays on screen after the page re-reads and finds the app gone.
 */
export function AuthenticatorResetForm({
  organizationId,
  userId,
  name,
  resettable,
}: {
  organizationId: string;
  userId: string;
  name: string;
  /** An app may be set up (or its status could not be read): offer the reset. */
  resettable: boolean;
}) {
  const [state, action, pending] = useActionState(resetAuthenticator, EMPTY_MEMBER_FORM);
  const form = useRef<HTMLFormElement>(null);

  return (
    <form ref={form} action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="userId" value={userId} />
      {resettable ? (
        <AlertDialog>
          <AlertDialogTrigger
            className={buttonVariants({ variant: "outline", size: "sm" })}
            disabled={pending}
          >
            {pending ? "Resetting…" : "Reset authenticator app"}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Reset {name}&apos;s authenticator app?</AlertDialogTitle>
            <AlertDialogDescription>
              Do this only when you are sure it is {name} asking, for example after a lost phone.
              The next time they use the console, after their password, they set up a new app. Their
              password, access and records stay as they are. The reset is recorded in the audit
              trail.
            </AlertDialogDescription>
            <div className="mt-2 flex justify-end gap-2">
              <AlertDialogClose className={buttonVariants({ variant: "ghost" })}>
                Cancel
              </AlertDialogClose>
              <AlertDialogClose
                className={buttonVariants({ variant: "destructive" })}
                onClick={() => form.current?.requestSubmit()}
              >
                Reset
              </AlertDialogClose>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
      {state.error ? (
        <p role="alert" className="max-w-72 text-right text-[12px] text-danger">
          {state.error}
        </p>
      ) : state.done ? (
        <p role="status" className="max-w-72 text-right text-[12px] text-ok">
          {state.done}
        </p>
      ) : null}
    </form>
  );
}
