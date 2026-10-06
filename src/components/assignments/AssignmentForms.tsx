"use client";

import { createContext, useActionState, useContext, useRef, useState } from "react";
import {
  assignPatient,
  replaceAssignment,
  unassignPatient,
} from "@/app/(dashboard)/assignments/actions";
import {
  EMPTY_ASSIGNMENT_FORM,
  type AssignmentFormState,
} from "@/app/(dashboard)/assignments/state";
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

export interface MemberOption {
  userId: string;
  label: string;
}

/**
 * Where a successful change is announced. A change usually removes the form that
 * made it — a removed row, a handed-over row, the Assign card once nobody is left
 * to assign — so its own message would unmount with it before anyone saw it. The
 * section keeps one status line instead; errors stay beside their form, which a
 * failed change leaves in place.
 */
const ReportDone = createContext<(message: string | null) => void>(() => {});

export function AssignmentFeedback({ children }: { children: React.ReactNode }) {
  const [done, setDone] = useState<string | null>(null);
  return (
    <ReportDone.Provider value={setDone}>
      {/* Always mounted, so screen readers announce the message when it appears. */}
      <p role="status" className="text-[12px] text-ok empty:hidden">
        {done}
      </p>
      {children}
    </ReportDone.Provider>
  );
}

type AssignmentAction = (
  previous: AssignmentFormState,
  formData: FormData,
) => Promise<AssignmentFormState>;

/** The action, with its success reported to the section rather than kept in the form. */
function useAssignmentAction(serverAction: AssignmentAction) {
  const report = useContext(ReportDone);
  return useActionState<AssignmentFormState, FormData>(async (previous, formData) => {
    report(null);
    const state = await serverAction(previous, formData);
    if (state.done) report(state.done);
    return state;
  }, EMPTY_ASSIGNMENT_FORM);
}

function FormError({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-[12px] text-danger">
      {error}
    </p>
  ) : null;
}

/** Assign one more of the laboratory's active members, either role. */
export function AssignForm({
  patientId,
  options,
}: {
  patientId: string;
  options: readonly MemberOption[];
}) {
  const [state, action, pending] = useAssignmentAction(assignPatient);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="patientId" value={patientId} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-64 flex-col gap-1">
          <span className="text-[12px] font-medium text-stone-deep">Assign someone</span>
          <NativeSelect name="userId" defaultValue="" required>
            <NativeSelectOption value="" disabled>
              Choose a person
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
      <FormError error={state.error} />
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
  const [state, action, pending] = useAssignmentAction(unassignPatient);
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
      <FormError error={state.error} />
    </form>
  );
}

/**
 * Hand the patient from this person to another: the only way to change the last
 * active member on it, since a patient is never left with nobody.
 */
export function ReplaceAssignmentForm({
  patientId,
  userId,
  options,
}: {
  patientId: string;
  userId: string;
  options: readonly MemberOption[];
}) {
  const [state, action, pending] = useAssignmentAction(replaceAssignment);
  if (options.length === 0) {
    return (
      <p className="max-w-64 text-right text-[12px] text-stone-mid">
        The only active member on this patient. Invite or reactivate someone to hand over.
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
      <FormError error={state.error} />
    </form>
  );
}
