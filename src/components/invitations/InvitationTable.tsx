import {
  canManageInvitation,
  invitationState,
  type ConsoleAccess,
  type Invitation,
  type InvitationState,
} from "@/domain";
import { INVITATION_LIST_LIMIT } from "@/ports/db";
import { formatDate, formatDateTime } from "@/lib/format";
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
import { InvitationActions } from "./InvitationForms";

const STATE_BADGE: Record<
  InvitationState,
  { label: string; variant: "default" | "neutral" | "ok" | "warn" }
> = {
  pending: { label: "Pending", variant: "default" },
  expired: { label: "Expired", variant: "warn" },
  accepted: { label: "Accepted", variant: "ok" },
  revoked: { label: "Revoked", variant: "neutral" },
};

/** When the row's state happened, or will lapse. */
function stateDate(invitation: Invitation, state: InvitationState): string {
  switch (state) {
    case "pending":
      return `Until ${formatDateTime(invitation.expiresAt)}`;
    case "expired":
      return `Since ${formatDate(invitation.expiresAt)}`;
    case "accepted":
      return formatDate(invitation.acceptedAt);
    case "revoked":
      return formatDate(invitation.revokedAt);
  }
}

/** Every invitation into one organization, with re-send and revoke where allowed. */
export function InvitationTable({
  invitations,
  access,
  caption,
  empty = "No invitations yet.",
  now = new Date(),
}: {
  invitations: readonly Invitation[];
  access: ConsoleAccess;
  caption: string;
  /** What to say when there are none. */
  empty?: string;
  now?: Date;
}) {
  if (invitations.length === 0) {
    return (
      <p className="rounded-[12px] border border-stone-hair bg-surface p-6 text-[13px] text-stone-mid">
        {empty}
      </p>
    );
  }

  return (
    <>
      <Table className="min-w-[720px]">
        <TableCaption>{caption}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
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
                  {invitation.role === "org_admin" ? "Organization admin" : "Medtech"}
                </TableCell>
                <TableCell>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </TableCell>
                <TableCell className="tnum">{stateDate(invitation, state)}</TableCell>
                <TableCell className="tnum">
                  {invitation.sentCount === 1 ? "Once" : `${invitation.sentCount} times`}
                </TableCell>
                <TableCell className="text-right">
                  {open && canManageInvitation(access, invitation) ? (
                    <InvitationActions id={invitation.id} email={invitation.email} />
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
