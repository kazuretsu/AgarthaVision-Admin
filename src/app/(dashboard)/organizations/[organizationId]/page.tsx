import { notFound } from "next/navigation";
import { getDatabase } from "@/adapters/registry";
import { isUuid } from "@/domain";
import { MissingEnvironmentError } from "@/lib/env";
import { requirePageAccess } from "@/lib/console-access";
import { formatDate, personName } from "@/lib/format";
import { Breadcrumbs } from "@/components/records/Breadcrumbs";
import { DataUnavailable } from "@/components/records/DataUnavailable";
import { Fact } from "@/components/records/Fact";
import {
  OrganizationStatusForm,
  RenameOrganizationForm,
} from "@/components/organizations/OrganizationForms";
import { InviteForm } from "@/components/invitations/InvitationForms";
import { InvitationTable } from "@/components/invitations/InvitationTable";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** One organization: its settings and its people. Super admins only. */
export const dynamic = "force-dynamic";

export default async function OrganizationPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const actor = await requirePageAccess(["super_admin"]);
  const { organizationId } = await params;
  // A malformed id names no organization; Postgres would reject it as an error.
  if (!isUuid(organizationId)) notFound();

  let organization;
  let invitations;
  try {
    const db = await getDatabase();
    [organization, invitations] = await Promise.all([
      db.getOrganization(organizationId),
      db.listInvitations(organizationId),
    ]);
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return <DataUnavailable title="Organization" variable={cause.variable} />;
    }
    throw cause;
  }
  if (!organization) notFound();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <Breadcrumbs
        items={[{ label: "Organizations", href: "/organizations" }, { label: organization.name }]}
      />

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-bold text-stone-ink">{organization.name}</h1>
        {organization.status === "active" ? (
          <Badge variant="ok">Active</Badge>
        ) : (
          <Badge variant="neutral">Deactivated</Badge>
        )}
      </header>

      <Card>
        <CardContent className="grid grid-cols-4 gap-4">
          <Fact label="Organization admins" value={String(organization.orgAdminCount)} mono />
          <Fact label="Medtechs" value={String(organization.medtechCount)} mono />
          <Fact label="Patients" value={String(organization.patientCount)} mono />
          <Fact label="Created" value={formatDate(organization.createdAt)} />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-stone-ink">Members</h2>
        {organization.members.length === 0 ? (
          <p className="rounded-[12px] border border-stone-hair bg-surface p-6 text-[13px] text-stone-mid">
            Nobody belongs to this organization yet. Organization admins are added by invitation.
          </p>
        ) : (
          <Table className="min-w-[560px]">
            <TableCaption>Members of {organization.name}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organization.members.map((member) => (
                <TableRow key={member.userId}>
                  <TableCell className="font-medium text-stone-ink">{personName(member)}</TableCell>
                  <TableCell>
                    {member.role === "org_admin" ? (
                      <Badge>Organization admin</Badge>
                    ) : (
                      <Badge variant="neutral">Medtech</Badge>
                    )}
                  </TableCell>
                  <TableCell>{member.status === "active" ? "Active" : "Deactivated"}</TableCell>
                  <TableCell className="tnum">{formatDate(member.addedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-stone-ink">Invitations</h2>
        {organization.status === "active" ? (
          <Card>
            <CardContent>
              <InviteForm organizationId={organization.id} role="org_admin" />
            </CardContent>
          </Card>
        ) : (
          <p className="text-[13px] text-stone-mid">
            A deactivated organization takes no new invitations. Reactivate it first.
          </p>
        )}
        <InvitationTable
          invitations={invitations}
          access={actor.access}
          caption={`Invitations into ${organization.name}`}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <RenameOrganizationForm id={organization.id} name={organization.name} />
          <OrganizationStatusForm
            id={organization.id}
            name={organization.name}
            status={organization.status}
          />
        </CardContent>
      </Card>
    </main>
  );
}
