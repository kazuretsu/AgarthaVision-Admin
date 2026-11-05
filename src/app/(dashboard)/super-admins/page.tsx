import type { Metadata } from "next";
import { getDatabase } from "@/adapters/registry";
import { superAdminRevokeRefusal } from "@/domain";
import { MissingEnvironmentError } from "@/lib/env";
import { requirePageAccess } from "@/lib/console-access";
import { formatDate } from "@/lib/format";
import { DataUnavailable } from "@/components/records/DataUnavailable";
import {
  RevokeSuperAdminForm,
  SuperAdminInviteForm,
} from "@/components/super-admins/SuperAdminForms";
import { SuperAdminInvitationTable } from "@/components/super-admins/SuperAdminInvitationTable";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
 * Who runs the platform (14zcqntjwjg): the active super admins, inviting another, and revoking
 * one. Super admins only; anyone else gets a 404, so there is no route-level loading state.
 * Every change is in the audit trail, under no laboratory.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Super admins · AgarthaVision Admin" };

const REFUSAL_NOTE = {
  self: "You",
  last_super_admin: "Only super admin",
} as const;

export default async function SuperAdminsPage() {
  const actor = await requirePageAccess(["super_admin"]);

  let superAdmins;
  let invitations;
  try {
    const db = await getDatabase();
    [superAdmins, invitations] = await Promise.all([
      db.listSuperAdmins(),
      db.listSuperAdminInvitations(),
    ]);
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return <DataUnavailable title="Super admins" variable={cause.variable} />;
    }
    throw cause;
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-[22px] font-bold text-stone-ink">Super admins</h1>
        <p className="text-[13px] text-stone-mid">
          The people who run AgarthaVision. They manage every organization and read every
          laboratory&apos;s records without patients&apos; names. Nobody can revoke their own
          access, so there is always at least one.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-stone-ink">Active</h2>
        <Table className="min-w-[640px]">
          <TableCaption>Active super admins</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Since</TableHead>
              <TableHead>Granted by</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {superAdmins.map((person) => {
              const name = person.fullName ?? person.email ?? "Unnamed super admin";
              const refusal = superAdminRevokeRefusal(
                actor.access,
                actor.user.id,
                person,
                superAdmins.length,
              );
              return (
                <TableRow key={person.userId}>
                  <TableCell>
                    <span className="font-medium text-stone-ink">{name}</span>
                    {person.userId === actor.user.id ? (
                      <Badge variant="neutral" className="ml-2">
                        You
                      </Badge>
                    ) : null}
                    {person.fullName && person.email ? (
                      <span className="block text-[12px] text-stone-mid">{person.email}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="tnum">{formatDate(person.grantedAt)}</TableCell>
                  <TableCell>
                    {person.grantedByLabel ?? (
                      <span className="text-stone-mid">
                        {person.grantedById ? "Unknown" : "Granted by hand"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {refusal === null ? (
                      <RevokeSuperAdminForm userId={person.userId} name={name} />
                    ) : (
                      <span className="text-[12px] text-stone-mid">
                        {refusal === "forbidden" ? "—" : REFUSAL_NOTE[refusal]}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-stone-ink">Invite a super admin</h2>
        <Card>
          <CardContent>
            <SuperAdminInviteForm />
          </CardContent>
        </Card>
        <SuperAdminInvitationTable invitations={invitations} />
      </section>
    </main>
  );
}
