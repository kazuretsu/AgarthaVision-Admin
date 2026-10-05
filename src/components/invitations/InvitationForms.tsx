"use client";

import { useActionState, useRef } from "react";
import {
  inviteMember,
  resendInvitation,
  revokeInvitation,
} from "@/app/(dashboard)/invitations/actions";
import { EMPTY_INVITATION_FORM } from "@/app/(dashboard)/invitations/state";
import type { MembershipRole } from "@/domain/organizations";
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

function Feedback({ error, done }: { error: string | null; done: string | null }) {
  if (error) {
    return (
      <p role="alert" className="text-[13px] text-danger">
        {error}
      </p>
    );
  }
  if (done) {
    return (
      <p role="status" className="text-[13px] text-ok">
        {done}
      </p>
    );
  }
  return null;
}

/**
 * Invite one person. The role is fixed by who is inviting and shown, not chosen:
 * a super admin invites an organization admin, an org admin a medtech.
 */
export function InviteForm({
  organizationId,
  role,
}: {
  organizationId: string;
  role: MembershipRole;
}) {
  const [state, action, pending] = useActionState(inviteMember, EMPTY_INVITATION_FORM);
  const label = role === "org_admin" ? "organization admin" : "medtech";

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-64 flex-1 flex-col gap-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="name@example.com"
            defaultValue={state.values?.email ?? ""}
          />
        </div>
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Label htmlFor="invite-name">Name (optional)</Label>
          <Input
            id="invite-name"
            name="fullName"
            maxLength={120}
            autoComplete="off"
            defaultValue={state.values?.fullName ?? ""}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : `Invite ${label}`}
        </Button>
      </div>
      <p className="text-[12px] text-stone-mid">
        They get an email with a link to set their own password. The link works for 7 days.
      </p>
      <Feedback {...state} />
    </form>
  );
}

/** Re-send and revoke for one pending or expired invitation. */
export function InvitationActions({ id, email }: { id: string; email: string }) {
  const [resent, resend, resending] = useActionState(resendInvitation, EMPTY_INVITATION_FORM);
  const [revoked, revoke, revoking] = useActionState(revokeInvitation, EMPTY_INVITATION_FORM);
  const revokeForm = useRef<HTMLFormElement>(null);
  const feedback = revoked.error || revoked.done ? revoked : resent;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-2">
        <form action={resend}>
          <input type="hidden" name="invitationId" value={id} />
          <Button type="submit" size="sm" variant="outline" disabled={resending || revoking}>
            {resending ? "Sending…" : "Re-send"}
          </Button>
        </form>
        <form ref={revokeForm} action={revoke}>
          <input type="hidden" name="invitationId" value={id} />
          <AlertDialog>
            <AlertDialogTrigger
              className={buttonVariants({ variant: "ghost", size: "sm" })}
              disabled={resending || revoking}
            >
              {revoking ? "Revoking…" : "Revoke"}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogTitle>Revoke the invitation to {email}?</AlertDialogTitle>
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
                  onClick={() => revokeForm.current?.requestSubmit()}
                >
                  Revoke
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
