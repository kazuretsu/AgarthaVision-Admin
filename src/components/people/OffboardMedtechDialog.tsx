"use client";

import { useActionState, useState } from "react";
import { loadOffboardData, offboardMedtech } from "@/app/(dashboard)/people/actions";
import { EMPTY_MEMBER_FORM } from "@/app/(dashboard)/people/state";
import { memberPatientLabel, type MemberPatient, type MembershipRole } from "@/domain";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface ColleagueSummary {
  userId: string;
  fullName: string | null;
  email: string | null;
  role: MembershipRole;
}

function colleagueLabel(c: ColleagueSummary): string {
  const name = c.fullName?.trim() || c.email || "Unnamed colleague";
  const roleName = c.role === "org_admin" ? "Org Admin" : "Medtech";
  return `${name} (${roleName})`;
}

/**
 * Offboarding guided dialog (ticket 14zcqntjnt5):
 * Lists patients only that medtech is assigned to, asks who takes over (one colleague for all,
 * or per patient), reminds the org admin to collect the device, and deactivates the leaver.
 */
export function OffboardMedtechDialog({
  organizationId,
  userId,
  name,
  initialSoleCoverPatients,
  initialColleagues,
}: {
  organizationId: string;
  userId: string;
  name: string;
  initialSoleCoverPatients?: MemberPatient[];
  initialColleagues?: ColleagueSummary[];
}) {
  const [open, setOpen] = useState(false);
  const [fetchedData, setFetchedData] = useState<{
    patients: MemberPatient[];
    colleagues: ColleagueSummary[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const soleCoverPatients = initialSoleCoverPatients ?? fetchedData?.patients ?? [];
  const colleagues = initialColleagues ?? fetchedData?.colleagues ?? [];

  const [mode, setMode] = useState<"all" | "individual">("all");
  const defaultColleague = colleagues[0]?.userId ?? "";
  const [selectedAllColleague, setSelectedAllColleague] = useState<string>("");
  const [individualAssignments, setIndividualAssignments] = useState<Record<string, string>>({});

  const allColleagueId = selectedAllColleague || defaultColleague;

  const [state, action, isPending] = useActionState(offboardMedtech, EMPTY_MEMBER_FORM);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen && initialSoleCoverPatients === undefined && fetchedData === null) {
      setLoading(true);
      setLoadError(null);
      loadOffboardData(organizationId, userId)
        .then((res) => {
          setLoading(false);
          if (res.error) {
            setLoadError(res.error);
            return;
          }
          setFetchedData({
            patients: res.soleCoverPatients ?? [],
            colleagues: res.colleagues ?? [],
          });
        })
        .catch((err) => {
          setLoading(false);
          setLoadError("Could not load offboarding information. Try again.");
          console.error(err);
        });
    }
  };

  const handleAllColleagueChange = (colleagueId: string) => {
    setSelectedAllColleague(colleagueId);
  };

  const handleIndividualChange = (patientId: string, colleagueId: string) => {
    setIndividualAssignments((prev) => ({ ...prev, [patientId]: colleagueId }));
  };

  const getPatientColleague = (patientId: string): string => {
    if (mode === "individual") {
      return individualAssignments[patientId] || allColleagueId;
    }
    return allColleagueId;
  };

  const allAssigned =
    soleCoverPatients.length === 0 ||
    soleCoverPatients.every((p) => Boolean(getPatientColleague(p.patientId)));
  const canConfirm = colleagues.length > 0 && allAssigned;

  const reassignmentsPayload = JSON.stringify(
    soleCoverPatients.map((p) => ({
      patientId: p.patientId,
      toUserId: getPatientColleague(p.patientId),
    })),
  );

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger
        className={buttonVariants({ variant: "ghost", size: "sm" })}
        disabled={isPending}
      >
        Offboard
      </AlertDialogTrigger>
      <AlertDialogContent className="w-[min(38rem,calc(100vw-2rem))] max-h-[90vh] overflow-y-auto">
        <AlertDialogTitle>Offboard {name}?</AlertDialogTitle>
        <AlertDialogDescription>
          Deactivate {name}&apos;s account and hand over their open patients to an active colleague.
          Authorship on sessions, samples and reports remains unchanged under {name}&apos;s name.
        </AlertDialogDescription>

        {/* Device reminder */}
        <div
          role="note"
          className="rounded-[10px] border border-amber-200 bg-amber-50/80 p-3 text-[12px] text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <p className="font-semibold">Device collection reminder</p>
          <p className="mt-0.5">
            Collect {name}&apos;s mobile device or ensure they sign out. The phone still holds their
            assigned patients until signed out or wiped.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-stone-mid">
            <Spinner /> Loading patient and colleague assignments…
          </div>
        ) : loadError ? (
          <p role="alert" className="text-[13px] text-danger">
            {loadError}
          </p>
        ) : state.done ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 rounded-[10px] border border-emerald-200 bg-emerald-50/80 p-4 text-[13px] text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
              <p className="font-semibold">{state.done}</p>
              <p className="text-[12px] opacity-90">
                The medtech has been deactivated. Remind staff to collect the mobile device or have
                it signed out.
              </p>
            </div>
            <div className="flex justify-end">
              <AlertDialogClose className={buttonVariants({ variant: "outline", size: "sm" })}>
                Done
              </AlertDialogClose>
            </div>
          </div>
        ) : (
          <form action={action} className="flex flex-col gap-4">
            <input type="hidden" name="organizationId" value={organizationId} />
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="reassignments" value={reassignmentsPayload} />

            {colleagues.length === 0 ? (
              <p
                role="alert"
                className="rounded-[8px] border border-stone-hair bg-warn-tint p-3 text-[13px] text-warn"
              >
                No other active colleagues are available in this laboratory. Invite or reactivate
                another colleague before offboarding {name}.
              </p>
            ) : soleCoverPatients.length === 0 ? (
              <p className="rounded-[8px] border border-stone-hair bg-surface p-3 text-[13px] text-stone-deep">
                None of {name}&apos;s assigned patients require handover — all are already covered
                by other active colleagues (or none are assigned).
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-hair pb-2">
                  <div className="text-[13px] font-semibold text-stone-ink">
                    {soleCoverPatients.length} patient
                    {soleCoverPatients.length === 1 ? "" : "s"} requiring handover
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={mode === "all" ? "default" : "outline"}
                      onClick={() => setMode("all")}
                    >
                      One colleague for all
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={mode === "individual" ? "default" : "outline"}
                      onClick={() => setMode("individual")}
                    >
                      Per patient
                    </Button>
                  </div>
                </div>

                {mode === "all" ? (
                  <div className="flex flex-col gap-2 rounded-[8px] border border-stone-hair bg-surface p-3">
                    <Label className="text-[12px] font-medium text-stone-deep">
                      Choose colleague to take over all {soleCoverPatients.length} patient
                      {soleCoverPatients.length === 1 ? "" : "s"}:
                    </Label>
                    <NativeSelect
                      value={allColleagueId}
                      onChange={(e) => handleAllColleagueChange(e.target.value)}
                    >
                      {colleagues.map((c) => (
                        <NativeSelectOption key={c.userId} value={c.userId}>
                          {colleagueLabel(c)}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                ) : (
                  <div className="max-h-60 overflow-y-auto rounded-[8px] border border-stone-hair">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Patient</TableHead>
                          <TableHead>Barangay PSGC</TableHead>
                          <TableHead>Assign To</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {soleCoverPatients.map((patient) => (
                          <TableRow key={patient.patientId}>
                            <TableCell className="font-medium text-stone-ink">
                              {memberPatientLabel(patient)}
                            </TableCell>
                            <TableCell className="font-mono text-[12px]">
                              {patient.psgcBarangayCode}
                            </TableCell>
                            <TableCell>
                              <NativeSelect
                                size="sm"
                                value={getPatientColleague(patient.patientId)}
                                onChange={(e) =>
                                  handleIndividualChange(patient.patientId, e.target.value)
                                }
                              >
                                {colleagues.map((c) => (
                                  <NativeSelectOption key={c.userId} value={c.userId}>
                                    {colleagueLabel(c)}
                                  </NativeSelectOption>
                                ))}
                              </NativeSelect>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}

            {state.error ? (
              <p role="alert" className="text-[12px] text-danger">
                {state.error}
              </p>
            ) : null}

            <div className="mt-2 flex items-center justify-end gap-2">
              <AlertDialogClose
                className={buttonVariants({ variant: "ghost", size: "sm" })}
                disabled={isPending}
              >
                Cancel
              </AlertDialogClose>
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                disabled={isPending || loading || !canConfirm}
              >
                {isPending ? (
                  <>
                    <Spinner className="mr-1.5" /> Offboarding…
                  </>
                ) : soleCoverPatients.length > 0 ? (
                  "Reassign & Deactivate"
                ) : (
                  "Deactivate & Offboard"
                )}
              </Button>
            </div>
          </form>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
