"use client";

import { useActionState, useRef } from "react";
import { setMemberStatus } from "@/app/(dashboard)/people/actions";
import { EMPTY_MEMBER_FORM } from "@/app/(dashboard)/people/state";
import type { OrganizationStatus } from "@/domain/organizations";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Deactivate behind a confirmation, reactivate directly. Deactivating blocks
 * sign-in and deletes nothing.
 */
export function MemberStatusForm({
  organizationId,
  userId,
  name,
  status,
}: {
  organizationId: string;
  userId: string;
  name: string;
  status: OrganizationStatus;
}) {
  const [state, action, pending] = useActionState(setMemberStatus, EMPTY_MEMBER_FORM);
  const form = useRef<HTMLFormElement>(null);
  const next: OrganizationStatus = status === "active" ? "deactivated" : "active";

  return (
    <form ref={form} action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="status" value={next} />
      {next === "active" ? (
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Reactivating…" : "Reactivate"}
        </Button>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger
            className={buttonVariants({ variant: "ghost", size: "sm" })}
            disabled={pending}
          >
            {pending ? "Deactivating…" : "Deactivate"}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Deactivate {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They can no longer sign in to the AgarthaVision app or sync from it, and the app signs
              them out the next time it reaches the server. Nothing is deleted: their account, their
              patients and every record they made stay, and you can reactivate them at any time.
            </AlertDialogDescription>
            <div className="mt-2 flex justify-end gap-2">
              <AlertDialogClose className={buttonVariants({ variant: "ghost" })}>
                Cancel
              </AlertDialogClose>
              <AlertDialogClose
                className={buttonVariants({ variant: "destructive" })}
                onClick={() => form.current?.requestSubmit()}
              >
                Deactivate
              </AlertDialogClose>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {state.error ? (
        <p role="alert" className="max-w-64 text-right text-[12px] text-danger">
          {state.error}
        </p>
      ) : state.done ? (
        <p role="status" className="max-w-64 text-right text-[12px] text-ok">
          {state.done}
        </p>
      ) : null}
    </form>
  );
}
