import { invitationState, type SuperAdminInvitation } from "@/domain";
import { INVITATION_LIST_LIMIT } from "@/ports/db";
import { STATE_BADGE, stateDate } from "@/components/invitations/InvitationTable";
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
import { SuperAdminInvitationActions } from "./SuperAdminForms";

/** Every super admin invitation, newest first, with re-send and withdraw while it is open. */
export function SuperAdminInvitationTable({
  invitations,
  now = new Date(),
}: {
  invitations: readonly SuperAdminInvitation[];
  now?: Date;
}) {
  if (invitations.length === 0) {
    return (
      <p className="rounded-[12px] border border-stone-hair bg-surface p-6 text-[13px] text-stone-mid">
        No super admin invitations yet.
      </p>
    );
  }

  return (
    <>
      <Table className="min-w-[640px]">
        <TableCaption>Super admin invitations</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>When</TableHead>
            <TableHead>Sent</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitations.map((invitation) => {
            const state = invitationState(invitation, now);
            const badge = STATE_BADGE[state];
            const open = state === "pending" || state === "expired";
            return (
              <TableRow key={invitation.id}>
                <TableCell>
                  <span className="font-medium text-stone-ink">{invitation.email}</span>
                  {invitation.fullName ? (
                    <span className="block text-[12px] text-stone-mid">{invitation.fullName}</span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Badge variant={badge.variant}>
                    {state === "revoked" ? "Withdrawn" : badge.label}
                  </Badge>
                </TableCell>
                <TableCell className="tnum">{stateDate(invitation, state)}</TableCell>
                <TableCell className="tnum">
                  {invitation.sentCount === 1 ? "Once" : `${invitation.sentCount} times`}
                </TableCell>
                <TableCell className="text-right">
                  {open ? (
                    <SuperAdminInvitationActions id={invitation.id} email={invitation.email} />
                  ) : (
                    <span className="text-stone-mid">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {invitations.length >= INVITATION_LIST_LIMIT ? (
        <p className="text-[12px] text-stone-mid">
          Showing the newest {INVITATION_LIST_LIMIT} invitations.
        </p>
      ) : null}
    </>
  );
}
