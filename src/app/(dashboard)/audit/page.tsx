import Link from "next/link";
import { getDatabase } from "@/adapters/registry";
import {
  AUDIT_ACTIONS,
  auditActionLabel,
  describeAuditEntry,
  type OrganizationSummary,
  type Profile,
} from "@/domain";
import { ANY_CONSOLE_USER, requirePageAccess } from "@/lib/console-access";
import { MissingEnvironmentError } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { parsePeriod } from "@/lib/period";
import { scopeForRequest } from "@/lib/read-scope";
import { OrganizationFilter } from "@/components/organizations/OrganizationFilter";
import { DataUnavailable } from "@/components/records/DataUnavailable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * The audit trail. Every console write is recorded by the database in the same
 * transaction as the write, and no one — not a super admin, not the table owner —
 * can change or delete an entry. An org admin reads their own organization's
 * entries; a super admin reads all of them.
 */
export const dynamic = "force-dynamic";

/** Entries shown at once. The page says when a filter would show more. */
const AUDIT_LIMIT = 500;

function first(value: string | string[] | undefined): string | undefined {
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

const SELECT_CLASS =
  "h-9 rounded-[8px] border border-stone-line bg-surface px-2 text-[14px] text-stone-ink outline-none focus:border-maroon";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The layout is not re-rendered on a client-side navigation, so the page
  // repeats the check: a revoked admin loses access on their next click.
  await requirePageAccess(ANY_CONSOLE_USER);

  const params = await searchParams;
  const period = parsePeriod(params);
  const actorId = first(params.actor);
  const action = first(params.action);
  const { actor, scope } = await scopeForRequest(params.org);
  const isSuperAdmin = actor.access.kind === "super_admin";

  let entries;
  let people: Profile[];
  let organizations: OrganizationSummary[] = [];
  try {
    const db = await getDatabase();
    [entries, people, organizations] = await Promise.all([
      db.listAuditEntries({
        scope,
        actorId,
        action: action && action in AUDIT_ACTIONS ? action : undefined,
        from: period.from,
        to: period.to,
        limit: AUDIT_LIMIT,
      }),
      db.listProfiles(),
      isSuperAdmin ? db.listOrganizations() : Promise.resolve([]),
    ]);
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return <DataUnavailable title="Audit trail" variable={cause.variable} />;
    }
    throw cause;
  }

  // Everyone the reader may see: an org admin's own members, or every profile.
  const actors = people;
  const filtered = Boolean(actorId || action || period.from || period.to || params.org);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[22px] font-bold text-stone-ink">Audit trail</h1>
        <p className="text-[13px] text-stone-mid">
          Every change made in the console, and every export, newest first. Entries are written with
          the change itself and can never be edited or deleted.
        </p>
      </header>

      <form className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-stone-deep">Person</span>
          <select name="actor" defaultValue={actorId ?? ""} className={SELECT_CLASS}>
            <option value="">Anyone</option>
            {actors.map((person) => (
              <option key={person.id} value={person.id}>
                {person.fullName?.trim() || "Unnamed user"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-stone-deep">Action</span>
          <select name="action" defaultValue={action ?? ""} className={SELECT_CLASS}>
            <option value="">Any action</option>
            {Object.entries(AUDIT_ACTIONS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-stone-deep">From</span>
          <Input type="date" name="from" defaultValue={period.from} className="w-40" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-stone-deep">To</span>
          <Input type="date" name="to" defaultValue={period.to} className="w-40" />
        </label>
        {isSuperAdmin ? <OrganizationFilter organizations={organizations} scope={scope} /> : null}
        <Button type="submit" variant="outline">
          Apply
        </Button>
        {filtered ? (
          <Link href="/audit" className="px-2 text-[13px] text-stone-mid hover:text-maroon">
            Reset
          </Link>
        ) : null}
      </form>

      {entries.length >= AUDIT_LIMIT ? (
        <p role="status" className="rounded-[10px] bg-warn-tint px-4 py-2 text-[13px] text-warn">
          Showing the newest {AUDIT_LIMIT} entries. Narrow the filters to see older ones.
        </p>
      ) : null}

      {entries.length === 0 ? (
        <p className="rounded-[12px] border border-stone-hair bg-surface p-6 text-[13px] text-stone-mid">
          {filtered ? "No entries match these filters." : "Nothing has been recorded yet."}
        </p>
      ) : (
        <Table className="min-w-[720px]">
          <TableCaption>Audit entries, newest first</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>What happened</TableHead>
              {isSuperAdmin ? <TableHead>Organization</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="tnum whitespace-nowrap">{formatDateTime(entry.at)}</TableCell>
                <TableCell>
                  {entry.actorLabel ?? (
                    <span className="text-stone-mid">
                      {entry.actorId ? "Unnamed user" : "System"}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="neutral">{auditActionLabel(entry.action)}</Badge>
                </TableCell>
                <TableCell className="text-stone-ink">{describeAuditEntry(entry)}</TableCell>
                {isSuperAdmin ? (
                  <TableCell>
                    {entry.organizationName ?? <span className="text-stone-mid">—</span>}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
