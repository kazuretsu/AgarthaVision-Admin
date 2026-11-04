"use client";

import { useActionState, useRef, useState } from "react";
import {
  revokePatientShareAction,
  sharePatientAction,
  INITIAL_SHARE_STATE,
  type ShareFormState,
} from "@/app/(dashboard)/records/patients/[patientId]/actions";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

export interface TargetOrgOption {
  id: string;
  name: string;
}

export function SharePatientForm({
  patientId,
  options,
}: {
  patientId: string;
  options: readonly TargetOrgOption[];
}) {
  const [state, formAction, pending] = useActionState<ShareFormState, FormData>(
    sharePatientAction,
    INITIAL_SHARE_STATE,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedOrg, setSelectedOrg] = useState(options[0]?.id ?? "");
  const [reason, setReason] = useState("");

  if (options.length === 0) {
    return null;
  }

  return (
    <Card className="border border-stone-hair bg-surface">
      <CardContent className="flex flex-col gap-4 p-5">
        <div>
          <h3 className="text-[14px] font-semibold text-stone-ink">
            Share patient with another laboratory
          </h3>
          <p className="text-[12px] text-stone-mid">
            A referral allows the receiving laboratory to see this patient and assign their own
            medtechs. A stated reason is required for the audit trail.
          </p>
        </div>

        <form
          ref={formRef}
          action={async (formData) => {
            await formAction(formData);
            if (!state.error) {
              setReason("");
            }
          }}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="patientId" value={patientId} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="targetOrganizationId">Receiving laboratory</Label>
            <NativeSelect
              id="targetOrganizationId"
              name="targetOrganizationId"
              value={selectedOrg}
              onChange={(e) => setSelectedOrg(e.target.value)}
              disabled={pending}
              className="w-full max-w-md"
            >
              {options.map((org) => (
                <NativeSelectOption key={org.id} value={org.id}>
                  {org.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason">Reason for referral</Label>
            <Input
              id="reason"
              name="reason"
              placeholder="e.g. Referred for expert confirmation of atypical ova"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
              maxLength={500}
              className="max-w-xl"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" size="sm" disabled={pending || !reason.trim()} className="w-fit">
              {pending ? "Sharing…" : "Share patient"}
            </Button>

            {state.done ? (
              <span role="status" className="text-[12px] text-ok">
                {state.done}
              </span>
            ) : null}
            {state.error ? (
              <span role="alert" className="text-[12px] text-danger">
                {state.error}
              </span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function RevokeShareDialog({
  shareId,
  patientId,
  targetOrganizationName,
}: {
  shareId: string;
  patientId: string;
  targetOrganizationName: string;
}) {
  const [state, formAction, pending] = useActionState<ShareFormState, FormData>(
    revokePatientShareAction,
    INITIAL_SHARE_STATE,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [revokeReason, setRevokeReason] = useState("");

  return (
    <form ref={formRef} action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="shareId" value={shareId} />
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="reason" value={revokeReason} />

      <AlertDialog>
        <AlertDialogTrigger
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          disabled={pending}
        >
          {pending ? "Revoking…" : "Revoke"}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>Revoke share with {targetOrganizationName}?</AlertDialogTitle>
          <AlertDialogDescription>
            {targetOrganizationName} will immediately lose access to this patient. Nothing is
            deleted: all past smears, records, and audit history remain intact.
          </AlertDialogDescription>

          <div className="my-2 flex flex-col gap-1.5 text-left">
            <Label htmlFor={`revoke-reason-${shareId}`}>Reason for revoking</Label>
            <Input
              id={`revoke-reason-${shareId}`}
              placeholder="e.g. Referral completed, second opinion received"
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              maxLength={500}
            />
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <AlertDialogClose className={buttonVariants({ variant: "ghost" })}>
              Cancel
            </AlertDialogClose>
            <AlertDialogClose
              className={buttonVariants({ variant: "destructive" })}
              disabled={!revokeReason.trim()}
              onClick={() => formRef.current?.requestSubmit()}
            >
              Confirm revocation
            </AlertDialogClose>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {state.error ? (
        <span role="alert" className="text-[12px] text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
