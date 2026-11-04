import {
  canSharePatient,
  isShareActive,
  type ConsoleAccess,
  type OrganizationSummary,
  type PatientShare,
} from "@/domain";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RevokeShareDialog, SharePatientForm, type TargetOrgOption } from "./PatientShareForms";

export function PatientSharesPanel({
  patientId,
  shares,
  availableOrganizations,
  access,
  isOwningOrganization,
  owningOrganizationName,
}: {
  patientId: string;
  shares: readonly PatientShare[];
  availableOrganizations: readonly OrganizationSummary[];
  access: ConsoleAccess;
  isOwningOrganization: boolean;
  owningOrganizationName?: string | null;
}) {
  const canManage = canSharePatient(access, isOwningOrganization);

  // Exclude owning organization and organizations with active shares
  const activeTargetOrgIds = new Set(
    shares.filter(isShareActive).map((s) => s.targetOrganizationId),
  );

  const callerOrgId = access.kind === "org_admin" ? access.organizationId : null;
  const targetOptions: TargetOrgOption[] = availableOrganizations
    .filter(
      (org) =>
        org.status === "active" &&
        (!callerOrgId || org.id !== callerOrgId) &&
        !activeTargetOrgIds.has(org.id),
    )
    .map((org) => ({ id: org.id, name: org.name }));

  // Check if viewing as a receiving laboratory
  const receivingShare =
    !isOwningOrganization && access.kind === "org_admin"
      ? shares.find((s) => s.targetOrganizationId === access.organizationId && isShareActive(s))
      : null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-[15px] font-semibold text-stone-ink">Laboratory Referrals</h2>
        <p className="text-[12px] text-stone-mid">
          Sharing a patient grants another laboratory access to view this patient and assign their
          own medtechs. The patient&apos;s owner never changes.
        </p>
      </div>

      {receivingShare ? (
        <Alert variant="warning">
          <AlertTitle>Referred Patient</AlertTitle>
          <AlertDescription>
            This patient was referred to your laboratory by{" "}
            <strong>
              {receivingShare.sourceOrganizationName ||
                owningOrganizationName ||
                "the owning laboratory"}
            </strong>
            {receivingShare.shareReason ? ` with reason: “${receivingShare.shareReason}”` : ""}.
            Your laboratory can assign medtechs to review this patient and perform new smears.
          </AlertDescription>
        </Alert>
      ) : null}

      {shares.length === 0 ? (
        <p className="rounded-[12px] border border-stone-hair bg-surface p-6 text-[13px] text-stone-mid">
          This patient has not been shared with any other laboratory.
        </p>
      ) : (
        <Table className="min-w-[720px]">
          <TableCaption>Laboratory referrals for this patient</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Laboratory</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Shared by</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Date</TableHead>
              {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shares.map((share) => {
              const active = isShareActive(share);
              return (
                <TableRow key={share.id} className="hover:bg-surface-sunken">
                  <TableCell className="font-medium text-stone-ink">
                    {share.targetOrganizationName}
                  </TableCell>
                  <TableCell>
                    {active ? (
                      <Badge variant="ok">Active</Badge>
                    ) : (
                      <Badge variant="neutral">Revoked</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-[13px] text-stone-deep">
                    {share.sharedByName ?? "Administrator"}
                  </TableCell>
                  <TableCell className="max-w-xs text-[13px] text-stone-deep">
                    <p className="truncate" title={share.shareReason}>
                      {share.shareReason}
                    </p>
                    {!active && share.revocationReason ? (
                      <p
                        className="truncate text-[11px] text-stone-mid"
                        title={`Revocation: ${share.revocationReason}`}
                      >
                        Revocation: {share.revocationReason}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="tnum text-[13px] text-stone-mid">
                    {formatDateTime(share.sharedAt)}
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      {active ? (
                        <RevokeShareDialog
                          shareId={share.id}
                          patientId={patientId}
                          targetOrganizationName={share.targetOrganizationName}
                        />
                      ) : (
                        <span className="text-[12px] text-stone-mid">—</span>
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {canManage && targetOptions.length > 0 ? (
        <SharePatientForm patientId={patientId} options={targetOptions} />
      ) : null}
    </section>
  );
}
