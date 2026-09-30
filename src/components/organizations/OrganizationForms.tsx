"use client";

import { useActionState, useRef } from "react";
import {
  createOrganization,
  renameOrganization,
  setOrganizationStatus,
} from "@/app/(dashboard)/organizations/actions";
import { EMPTY_ORGANIZATION_FORM } from "@/app/(dashboard)/organizations/state";
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
import { Input } from "@/components/ui/input";

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

export function CreateOrganizationForm() {
  const [state, action, pending] = useActionState(createOrganization, EMPTY_ORGANIZATION_FORM);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-64 flex-1 flex-col gap-1.5">
          <span className="text-[12px] font-medium text-stone-deep">Laboratory name</span>
          <Input
            name="name"
            required
            minLength={2}
            maxLength={120}
            placeholder="e.g. Cebu City Health Laboratory"
          />
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create organization"}
        </Button>
      </div>
      <Feedback {...state} />
    </form>
  );
}

export function RenameOrganizationForm({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(renameOrganization, EMPTY_ORGANIZATION_FORM);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="organizationId" value={id} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-64 flex-1 flex-col gap-1.5">
          <span className="text-[12px] font-medium text-stone-deep">Name</span>
          <Input name="name" defaultValue={name} required minLength={2} maxLength={120} />
        </label>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Rename"}
        </Button>
      </div>
      <Feedback {...state} />
    </form>
  );
}

/**
 * Deactivate behind a confirmation, reactivate directly. Deactivating deletes
 * nothing; it locks the laboratory's admins out until it is reactivated.
 */
export function OrganizationStatusForm({
  id,
  name,
  status,
}: {
  id: string;
  name: string;
  status: OrganizationStatus;
}) {
  const [state, action, pending] = useActionState(setOrganizationStatus, EMPTY_ORGANIZATION_FORM);
  const form = useRef<HTMLFormElement>(null);
  const next: OrganizationStatus = status === "active" ? "deactivated" : "active";

  return (
    <form ref={form} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="organizationId" value={id} />
      <input type="hidden" name="status" value={next} />
      {next === "active" ? (
        <Button type="submit" variant="outline" disabled={pending} className="self-start">
          {pending ? "Reactivating…" : "Reactivate organization"}
        </Button>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger
            className={buttonVariants({ variant: "outline", className: "self-start" })}
            disabled={pending}
          >
            Deactivate organization
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Deactivate {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its org admins lose console access until it is reactivated. Nothing is deleted: its
              members, patients and every record stay exactly as they are.
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
      <Feedback {...state} />
    </form>
  );
}
