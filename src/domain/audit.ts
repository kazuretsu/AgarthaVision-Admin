/**
 * The audit trail: every administrative write, who made it, to whom, and when.
 *
 * Entries are written by the database in the same transaction as the write they
 * record, and can never be changed (admin/0001). This module only reads and
 * describes them.
 */

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
  "member.deactivate": "Deactivated a medtech",
  "member.reactivate": "Reactivated a medtech",
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
      return `Deactivated ${text(d.name) ?? "a medtech"} in ${entry.organizationName ?? "an organization"}`;
    case "member.reactivate":
      return `Reactivated ${text(d.name) ?? "a medtech"} in ${entry.organizationName ?? "an organization"}`;
    default:
      return auditActionLabel(entry.action);
  }
}
