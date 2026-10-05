"use client";

import { useActionState, useRef } from "react";
import {
  assignPatient,
  replaceAssignment,
  unassignPatient,
} from "@/app/(dashboard)/assignments/actions";
import { EMPTY_ASSIGNMENT_FORM } from "@/app/(dashboard)/assignments/state";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

export interface MedtechOption {
  userId: string;
  label: string;
}

function Feedback({ error, done }: { error: string | null; done: string | null }) {
  if (error) {
    return (
      <p role="alert" className="text-[12px] text-danger">
        {error}
      </p>
    );
  }
  if (done) {
    return (
      <p role="status" className="text-[12px] text-ok">
        {done}
      </p>
    );
  }
  return null;
}

/** Assign one more of the laboratory's active medtechs. */
export function AssignForm({
  patientId,
  options,
}: {
  patientId: string;
  options: readonly MedtechOption[];
}) {
  const [state, action, pending] = useActionState(assignPatient, EMPTY_ASSIGNMENT_FORM);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="patientId" value={patientId} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-64 flex-col gap-1">
          <span className="text-[12px] font-medium text-stone-deep">Assign a medtech</span>
          <NativeSelect name="userId" defaultValue="" required>
            <NativeSelectOption value="" disabled>
              Choose a medtech
            </NativeSelectOption>
            {options.map((option) => (
              <NativeSelectOption key={option.userId} value={option.userId}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "Assigning…" : "Assign"}
        </Button>
      </div>
      <Feedback {...state} />
    </form>
  );
}

/** Remove one assignment, behind a confirmation. */
export function RemoveAssignmentForm({
  patientId,
  userId,
  name,
}: {
  patientId: string;
  userId: string;
  name: string;
}) {
  const [state, action, pending] = useActionState(unassignPatient, EMPTY_ASSIGNMENT_FORM);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="userId" value={userId} />
      <AlertDialog>
        <AlertDialogTrigger
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          disabled={pending}
        >
          {pending ? "Removing…" : "Remove"}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>Remove {name} from this patient?</AlertDialogTitle>
          <AlertDialogDescription>
            The patient leaves their app after its next sync. Nothing is deleted: the patient, every
            session and report, and who read each smear stay exactly as they are.
          </AlertDialogDescription>
          <div className="mt-2 flex justify-end gap-2">
            <AlertDialogClose className={buttonVariants({ variant: "ghost" })}>
              Cancel
            </AlertDialogClose>
            <AlertDialogClose
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => form.current?.requestSubmit()}
            >
              Remove
            </AlertDialogClose>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      <Feedback {...state} />
    </form>
  );
}

/**
 * Hand the patient from this medtech to another: the only way to change the last
 * active medtech, since a patient is never left with nobody.
 */
export function ReplaceAssignmentForm({
  patientId,
  userId,
  options,
}: {
  patientId: string;
  userId: string;
  options: readonly MedtechOption[];
}) {
  const [state, action, pending] = useActionState(replaceAssignment, EMPTY_ASSIGNMENT_FORM);
  if (options.length === 0) {
    return (
      <p className="max-w-64 text-right text-[12px] text-stone-mid">
        The only medtech on this patient. Invite or reactivate another to hand over.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="fromUserId" value={userId} />
      <div className="flex items-center justify-end gap-2">
        <NativeSelect
          name="userId"
          defaultValue=""
          required
          aria-label="Hand over to"
          className="w-48"
        >
          <NativeSelectOption value="" disabled>
            Hand over to…
          </NativeSelectOption>
          {options.map((option) => (
            <NativeSelectOption key={option.userId} value={option.userId}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Handing over…" : "Hand over"}
        </Button>
      </div>
      <Feedback {...state} />
    </form>
  );
}
