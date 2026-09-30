import Link from "next/link";
import { Search } from "lucide-react";
import { getDatabase } from "@/adapters/registry";
import { ageYears, patientDisplayName } from "@/domain";
import { MissingEnvironmentError } from "@/lib/env";
import { ANY_CONSOLE_USER, requirePageAccess } from "@/lib/console-access";
import { formatDate, personName } from "@/lib/format";
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
 * Records, entered by patient: Patient → Session → Sample.
 *
 * Read-only. The search lives in the query string, so a view can be shared. Row
 * visibility is decided by the database as the signed-in user.
 */
export const dynamic = "force-dynamic";

function param(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The layout is not re-rendered on a client-side navigation, so the page
  // repeats the check: a revoked admin loses access on their next click.
  await requirePageAccess(ANY_CONSOLE_USER);

  const params = await searchParams;
  const search = param(params.q);
  const barangay = param(params.barangay);

  let patients;
  try {
    patients = await (
      await getDatabase()
    ).listPatients({ search, barangayCode: barangay || undefined });
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return <DataUnavailable title="Records" variable={cause.variable} />;
    }
    throw cause;
  }

  const now = new Date();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[22px] font-bold text-stone-ink">Records</h1>
        <p className="text-[13px] text-stone-mid">
          Patients and every smear read for them, as the Android app reports them. Read-only.
        </p>
      </header>

      <form className="flex flex-wrap items-end gap-3" role="search">
        <label className="flex min-w-56 flex-1 flex-col gap-1.5">
          <span className="text-[12px] font-medium text-stone-deep">Name or codename</span>
          <Input name="q" defaultValue={search} placeholder="e.g. Dela Cruz or M24-001" />
        </label>
        <label className="flex w-48 flex-col gap-1.5">
          <span className="text-[12px] font-medium text-stone-deep">Barangay PSGC code</span>
          <Input
            name="barangay"
            defaultValue={barangay}
            inputMode="numeric"
            pattern="[0-9]{10}"
            placeholder="10 digits"
          />
        </label>
        <Button type="submit">
          <Search aria-hidden /> Search
        </Button>
        {search || barangay ? (
          <Link href="/records" className="text-[13px] text-stone-mid hover:text-maroon">
            Clear
          </Link>
        ) : null}
      </form>

      {patients.length === 0 ? (
        <p className="rounded-[12px] border border-stone-hair bg-surface p-6 text-[13px] text-stone-mid">
          {search || barangay ? "No patients match this search." : "No patients yet."}
        </p>
      ) : (
        <Table className="min-w-[760px]">
          <TableCaption>Patients, most recently registered first</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Patient</TableHead>
              <TableHead>Sex</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>Barangay</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
              <TableHead>Last session</TableHead>
              <TableHead>Registered by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {patients.map(({ patient, registeredBy, sessionCount, lastSessionAt }) => (
              <TableRow key={patient.id} className="hover:bg-surface-sunken">
                <TableCell>
                  <Link
                    href={`/records/patients/${patient.id}`}
                    className="font-semibold text-stone-ink hover:text-maroon"
                  >
                    {patientDisplayName(patient)}
                  </Link>
                  {patient.firstname.trim() === "" ? (
                    <Badge variant="neutral" className="ml-2">
                      Codename
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell>{patient.sex}</TableCell>
                <TableCell className="tnum">{ageYears(patient.birthdate, now)}</TableCell>
                <TableCell className="tnum">{patient.psgcBarangayCode}</TableCell>
                <TableCell className="tnum text-right">{sessionCount}</TableCell>
                <TableCell className="tnum">{formatDate(lastSessionAt)}</TableCell>
                <TableCell>{personName(registeredBy)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
