import Link from "next/link";
import { Suspense } from "react";
import { getDatabase } from "@/adapters/registry";
import {
  AUDIT_ACTIONS,
  auditActionLabel,
  describeAuditEntry,
  type OrganizationSummary,
  type AuditActor,
  type ReadScope,
} from "@/domain";
import { ANY_CONSOLE_USER, requirePageAccess } from "@/lib/console-access";
import { MissingEnvironmentError } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { parsePeriod, type Period } from "@/lib/period";
import { scopeForRequest } from "@/lib/read-scope";
import { OrganizationFilter } from "@/components/organizations/OrganizationFilter";
import { DataUnavailable } from "@/components/records/DataUnavailable";
import { Busy, TableSkeleton } from "@/components/loading/PageSkeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
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
 *
 * The filters render first; the entries read inside a Suspense boundary keyed by
 * the filters, so a new filter shows the table's skeleton too.
 */
export const dynamic = "force-dynamic";

/** Entries shown at once. The page says when a filter would show more. */
const AUDIT_LIMIT = 500;

function first(value: string | string[] | undefined): string | undefined {
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

/** One read of the trail for the filters, streamed into the table's skeleton. */
async function AuditEntries({
  scope,
  actorId,
  action,
  period,
  filtered,
  isSuperAdmin,
}: {
  scope: ReadScope;
  actorId: string | undefined;
  action: string | undefined;
  period: Period;
  filtered: boolean;
  isSuperAdmin: boolean;
}) {
  let entries;
  try {
    entries = await (
      await getDatabase()
    ).listAuditEntries({
      scope,
      actorId,
      action: action && Object.hasOwn(AUDIT_ACTIONS, action) ? action : undefined,
      from: period.from,
      to: period.to,
      limit: AUDIT_LIMIT,
    });
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return (
        <p className="text-[13px] text-stone-deep">
          <code className="font-mono">{cause.variable}</code> is not set, so nothing could be read.
        </p>
      );
    }
    throw cause;
  }

  return (
    <>
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
    </>
  );
}

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

  let actors: AuditActor[];
  let organizations: OrganizationSummary[] = [];
  try {
    const db = await getDatabase();
    [actors, organizations] = await Promise.all([
      db.listAuditActors(scope),
      isSuperAdmin ? db.listOrganizations() : Promise.resolve([]),
    ]);
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return <DataUnavailable title="Audit trail" variable={cause.variable} />;
    }
    throw cause;
  }

  const filtered = Boolean(actorId || action || period.from || period.to || params.org);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
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
          <NativeSelect name="actor" defaultValue={actorId ?? ""}>
            <NativeSelectOption value="">Anyone</NativeSelectOption>
            {/* Only people who appear in the trail the reader can read (admin/0011). */}
            {actors.map((person) => (
              <NativeSelectOption key={person.id} value={person.id}>
                {person.label?.trim() || "Unnamed user"}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-stone-deep">Action</span>
          <NativeSelect name="action" defaultValue={action ?? ""}>
            <NativeSelectOption value="">Any action</NativeSelectOption>
            {Object.entries(AUDIT_ACTIONS).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
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

      <Suspense
        key={JSON.stringify({ actorId, action, period, scope })}
        fallback={
          <Busy label="Loading audit entries…">
            <TableSkeleton rows={10} columns={isSuperAdmin ? 5 : 4} />
          </Busy>
        }
      >
        <AuditEntries
          scope={scope}
          actorId={actorId}
          action={action}
          period={period}
          filtered={filtered}
          isSuperAdmin={isSuperAdmin}
        />
      </Suspense>
    </main>
  );
}
