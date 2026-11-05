"use client";

import { useActionState, useRef } from "react";
import {
  inviteSuperAdmin,
  resendSuperAdminInvitation,
  revokeSuperAdmin,
  withdrawSuperAdminInvitation,
} from "@/app/(dashboard)/super-admins/actions";
import { EMPTY_INVITATION_FORM } from "@/app/(dashboard)/invitations/state";
import { SUPER_ADMIN_INVITATION_HOURS } from "@/domain/super-admins";
import { Feedback } from "@/components/invitations/InvitationForms";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The super admin page's forms (14zcqntjwjg): invite one, re-send or withdraw an invitation,
 * revoke one. Composed from the shadcn primitives; the server actions do the work.
 */

export function SuperAdminInviteForm() {
  const [state, action, pending] = useActionState(inviteSuperAdmin, EMPTY_INVITATION_FORM);

  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-64 flex-1 flex-col gap-1.5">
          <Label htmlFor="super-invite-email">Email</Label>
          <Input
            id="super-invite-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="name@example.com"
            defaultValue={state.values?.email ?? ""}
          />
        </div>
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Label htmlFor="super-invite-name">Name (optional)</Label>
          <Input
            id="super-invite-name"
            name="fullName"
            maxLength={120}
            autoComplete="off"
            defaultValue={state.values?.fullName ?? ""}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Invite super admin"}
        </Button>
      </div>
      <p className="text-[12px] text-stone-mid">
        They get an email with a link to set their own password. The link works for{" "}
        {SUPER_ADMIN_INVITATION_HOURS} hours. A super admin can see every laboratory and its records
        (without patients&apos; names) and manage every organization, so invite only people who run
        the platform.
      </p>
      <Feedback {...state} />
    </form>
  );
}

/** Re-send and withdraw for one pending or expired super admin invitation. */
export function SuperAdminInvitationActions({ id, email }: { id: string; email: string }) {
  const [resent, resend, resending] = useActionState(
    resendSuperAdminInvitation,
    EMPTY_INVITATION_FORM,
  );
  const [withdrawn, withdraw, withdrawing] = useActionState(
    withdrawSuperAdminInvitation,
    EMPTY_INVITATION_FORM,
  );
  const withdrawForm = useRef<HTMLFormElement>(null);
  const feedback = withdrawn.error || withdrawn.done ? withdrawn : resent;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-2">
        <form action={resend}>
          <input type="hidden" name="invitationId" value={id} />
          <Button type="submit" size="sm" variant="outline" disabled={resending || withdrawing}>
            {resending ? "Sending…" : "Re-send"}
          </Button>
        </form>
        <form ref={withdrawForm} action={withdraw}>
          <input type="hidden" name="invitationId" value={id} />
          <AlertDialog>
            <AlertDialogTrigger
              className={buttonVariants({ variant: "ghost", size: "sm" })}
              disabled={resending || withdrawing}
            >
              {withdrawing ? "Withdrawing…" : "Withdraw"}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogTitle>Withdraw the invitation to {email}?</AlertDialogTitle>
              <AlertDialogDescription>
                The link in their email stops working. Nothing is deleted, and you can invite them
                again later.
              </AlertDialogDescription>
              <div className="mt-2 flex justify-end gap-2">
                <AlertDialogClose className={buttonVariants({ variant: "ghost" })}>
                  Cancel
                </AlertDialogClose>
                <AlertDialogClose
                  className={buttonVariants({ variant: "destructive" })}
                  onClick={() => withdrawForm.current?.requestSubmit()}
                >
                  Withdraw
                </AlertDialogClose>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        </form>
      </div>
      <Feedback {...feedback} />
    </div>
  );
}

/** Revoke one super admin, behind a confirmation. The page offers it only where allowed. */
export function RevokeSuperAdminForm({ userId, name }: { userId: string; name: string }) {
  const [state, action, pending] = useActionState(revokeSuperAdmin, EMPTY_INVITATION_FORM);
  const form = useRef<HTMLFormElement>(null);

  return (
    <form ref={form} action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <AlertDialog>
        <AlertDialogTrigger
          className={buttonVariants({ variant: "outline", size: "sm" })}
          disabled={pending}
        >
          {pending ? "Revoking…" : "Revoke"}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>Revoke {name}&apos;s super admin access?</AlertDialogTitle>
          <AlertDialogDescription>
            From their next click they can no longer use the console. Their account stays, so a
            super admin can invite them again; the grant stays on record with who revoked it and
            when. The revocation is recorded in the audit trail.
          </AlertDialogDescription>
          <div className="mt-2 flex justify-end gap-2">
            <AlertDialogClose className={buttonVariants({ variant: "ghost" })}>
              Cancel
            </AlertDialogClose>
            <AlertDialogClose
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => form.current?.requestSubmit()}
            >
              Revoke
            </AlertDialogClose>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      <Feedback {...state} />
    </form>
  );
}
