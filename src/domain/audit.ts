/**
 * The audit trail: every administrative write, who made it, to whom, and when.
 *
 * Entries are written by the database in the same transaction as the write they
 * record, and can never be changed (admin/0001). This module only reads and
 * describes them.
 */

/** Someone who appears in the trail, under the label their latest entry carries. */
export interface AuditActor {
  id: string;
  label: string | null;
}

export interface AuditEntry {
  id: number;
  at: string;
  actorId: string | null;
  /** Who acted, as they were named at the time — kept even if their profile goes. */
  actorLabel: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  organizationId: string | null;
  organizationName: string | null;
  details: Record<string, unknown>;
}

/** Every action the console writes today, with how it reads on the page. */
export const AUDIT_ACTIONS: Readonly<Record<string, string>> = {
  "organization.backfill": "Placed existing records in the starting organization",
  "organization.create": "Created an organization",
  "organization.rename": "Renamed an organization",
  "organization.deactivate": "Deactivated an organization",
  "organization.reactivate": "Reactivated an organization",
  "export.research": "Downloaded a research export",
  "invitation.create": "Sent an invitation",
  "invitation.resend": "Re-sent an invitation",
  "invitation.revoke": "Revoked an invitation",
  "invitation.accept": "Accepted an invitation",
  "member.deactivate": "Deactivated a member",
  "member.reactivate": "Reactivated a member",
  "assignment.add": "Assigned a patient",
  "assignment.remove": "Removed a patient assignment",
};

/** The action's label; an action this build does not know is shown as recorded. */
export function auditActionLabel(action: string): string {
  return AUDIT_ACTIONS[action] ?? action;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** One line saying what happened, from the entry's details. */
export function describeAuditEntry(entry: AuditEntry): string {
  const d = entry.details;
  switch (entry.action) {
    case "organization.create":
      return `Created ${text(d.name) ?? "an organization"}`;
    case "organization.rename":
      return `Renamed ${text(d.from) ?? "an organization"} to ${text(d.to) ?? "a new name"}`;
    case "organization.deactivate":
      return `Deactivated ${entry.organizationName ?? "an organization"}`;
    case "organization.reactivate":
      return `Reactivated ${entry.organizationName ?? "an organization"}`;
    case "organization.backfill":
      return `Placed ${String(d.members ?? 0)} existing members and ${String(d.patients ?? 0)} patients in ${entry.organizationName ?? "the starting organization"}`;
    case "export.research": {
      const rows =
        typeof d.rows === "number" ? `${d.rows} smear${d.rows === 1 ? "" : "s"}` : "smears";
      const period = [text(d.from), text(d.to)].filter(Boolean).join(" to ") || "all time";
      return `Exported ${rows} as ${String(d.format ?? "a file").toUpperCase()}, ${period}`;
    }
    case "invitation.create":
    case "invitation.resend":
    case "invitation.revoke":
    case "invitation.accept": {
      const who = text(d.email) ?? "someone";
      const as = d.role === "org_admin" ? "an organization admin" : "a medtech";
      const where = entry.organizationName ?? "an organization";
      const verb = {
        "invitation.create": `Invited ${who} as ${as} to ${where}`,
        "invitation.resend": `Re-sent the invitation to ${who}`,
        "invitation.revoke": `Revoked the invitation to ${who}`,
        "invitation.accept": `${who} joined ${where} as ${as}`,
      } as const;
      return verb[entry.action];
    }
    case "member.deactivate":
    case "member.reactivate": {
      // An org admin is named as one (admin/0009); a medtech, as before, by name alone.
      const who = `${text(d.name) ?? "a member"}${d.role === "org_admin" ? " (organization admin)" : ""}`;
      const verb = entry.action === "member.deactivate" ? "Deactivated" : "Reactivated";
      return `${verb} ${who} in ${entry.organizationName ?? "an organization"}`;
    }
    case "assignment.add":
    case "assignment.remove": {
      // The patient by record id only: super admins read this trail (constraint #14).
      const patient = entry.targetId ? `patient ${entry.targetId.slice(0, 8)}` : "a patient";
      // admin/0008 names the person `member`; entries from admin/0007 call them `medtech`.
      const member = text(d.member) ?? text(d.medtech) ?? "someone";
      return entry.action === "assignment.add"
        ? `Assigned ${patient} to ${member}`
        : `Removed ${patient} from ${member}`;
    }
    default:
      return auditActionLabel(entry.action);
  }
}
