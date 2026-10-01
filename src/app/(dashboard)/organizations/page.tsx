import Link from "next/link";
import { getDatabase } from "@/adapters/registry";
import { MissingEnvironmentError } from "@/lib/env";
import { requirePageAccess } from "@/lib/console-access";
import { formatDate } from "@/lib/format";
import { DataUnavailable } from "@/components/records/DataUnavailable";
import { CreateOrganizationForm } from "@/components/organizations/OrganizationForms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Laboratory organizations. Super admins only; everyone else gets a 404. */
export const dynamic = "force-dynamic";

export default async function OrganizationsPage() {
  await requirePageAccess(["super_admin"]);

  let organizations;
  try {
    organizations = await (await getDatabase()).listOrganizations();
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return <DataUnavailable title="Organizations" variable={cause.variable} />;
    }
    throw cause;
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-[22px] font-bold text-stone-ink">Organizations</h1>
        <p className="text-[13px] text-stone-mid">
          Each laboratory owns its patients. Every change here is recorded in the audit trail.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>New organization</CardTitle>
          <CardDescription>Names must be unique, ignoring case.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateOrganizationForm />
        </CardContent>
      </Card>

      {organizations.length === 0 ? (
        <p className="rounded-[12px] border border-stone-hair bg-surface p-6 text-[13px] text-stone-mid">
          No organizations yet.
        </p>
      ) : (
        <Table className="min-w-[640px]">
          <TableCaption>Organizations by name</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Organization</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Organization admins</TableHead>
              <TableHead className="text-right">Medtechs</TableHead>
              <TableHead className="text-right">Patients</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {organizations.map((organization) => (
              <TableRow key={organization.id} className="hover:bg-surface-sunken">
                <TableCell>
                  <Link
                    href={`/organizations/${organization.id}`}
                    className="font-semibold text-stone-ink hover:text-maroon"
                  >
                    {organization.name}
                  </Link>
                </TableCell>
                <TableCell>
                  {organization.status === "active" ? (
                    <Badge variant="ok">Active</Badge>
                  ) : (
                    <Badge variant="neutral">Deactivated</Badge>
                  )}
                </TableCell>
                <TableCell className="tnum text-right">{organization.orgAdminCount}</TableCell>
                <TableCell className="tnum text-right">{organization.medtechCount}</TableCell>
                <TableCell className="tnum text-right">{organization.patientCount}</TableCell>
                <TableCell className="tnum">{formatDate(organization.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
