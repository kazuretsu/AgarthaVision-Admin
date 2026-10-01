import Link from "next/link";
import { notFound } from "next/navigation";
import { getDatabase } from "@/adapters/registry";
import { ageYears, isUuid, patientDisclosureFor, patientLabel, sessionLabel } from "@/domain";
import { MissingEnvironmentError } from "@/lib/env";
import { ANY_CONSOLE_USER, requirePageAccess } from "@/lib/console-access";
import { scopeForRequest } from "@/lib/read-scope";
import { formatBirthdate, formatDateTime, personName } from "@/lib/format";
import { Breadcrumbs } from "@/components/records/Breadcrumbs";
import { DataUnavailable } from "@/components/records/DataUnavailable";
import { Fact } from "@/components/records/Fact";
import { LpfInline } from "@/components/records/LpfTable";
import { ResultBadge } from "@/components/records/ResultBadge";
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
 * One patient and every session read for them, newest first. Sex and birthdate
 * appear only for a reader who may see them (`patientDisclosureFor`).
 */
export const dynamic = "force-dynamic";

export default async function PatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const actor = await requirePageAccess(ANY_CONSOLE_USER);
  // A malformed id names no record; Postgres would reject it as an error.
  if (!isUuid(patientId)) notFound();
  const { scope } = await scopeForRequest();

  let record;
  try {
    record = await (
      await getDatabase()
    ).getPatientRecord(patientId, scope, patientDisclosureFor(actor.access));
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return <DataUnavailable title="Patient" variable={cause.variable} />;
    }
    throw cause;
  }
  if (!record) notFound();

  const { patient, registeredBy, sessions } = record;
  const name = patientLabel(patient);
  const identity = patient.identity;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <Breadcrumbs items={[{ label: "Records", href: "/records" }, { label: name }]} />

      <header className="flex flex-col gap-1">
        <h1 className="text-[22px] font-bold text-stone-ink">{name}</h1>
        <p className="text-[13px] text-stone-mid">
          {sessions.length} session{sessions.length === 1 ? "" : "s"}
        </p>
      </header>

      <Card>
        <CardContent className="grid grid-cols-5 gap-4">
          {identity ? (
            <>
              <Fact label="Sex" value={identity.sex === "M" ? "Male" : "Female"} />
              <Fact
                label="Birthdate"
                value={`${formatBirthdate(identity.birthdate)} (${ageYears(identity.birthdate, new Date())} y)`}
              />
            </>
          ) : (
            <Fact label="Record ID" value={patient.id} mono />
          )}
          <Fact label="Barangay PSGC" value={patient.psgcBarangayCode} mono />
          <Fact label="Registered by" value={personName(registeredBy)} />
          <Fact label="Registered" value={formatDateTime(patient.createdAt)} />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-stone-ink">Sessions</h2>
        {sessions.length === 0 ? (
          <p className="rounded-[12px] border border-stone-hair bg-surface p-6 text-[13px] text-stone-mid">
            No sessions recorded for this patient yet.
          </p>
        ) : (
          <Table className="min-w-[760px]">
            <TableCaption>Sessions for {name}, newest first</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Session</TableHead>
                <TableHead>Read</TableHead>
                <TableHead>Read by</TableHead>
                <TableHead className="text-right">Fields</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>LPF per species</TableHead>
                <TableHead className="text-right">Eggs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map(({ session, author, summary }) => (
                <TableRow key={session.id} className="hover:bg-surface-sunken">
                  <TableCell>
                    <Link
                      href={`/records/sessions/${session.id}`}
                      className="font-semibold text-stone-ink hover:text-maroon"
                    >
                      {sessionLabel(session, patientDisclosureFor(actor.access))}
                    </Link>
                  </TableCell>
                  <TableCell className="tnum">{formatDateTime(session.startedAt)}</TableCell>
                  <TableCell>{personName(author)}</TableCell>
                  <TableCell className="tnum text-right">{summary.fieldCount}</TableCell>
                  <TableCell>
                    {summary.fieldCount === 0 ? (
                      <span className="text-stone-mid">Not read</span>
                    ) : (
                      <ResultBadge positive={summary.isPositive} />
                    )}
                  </TableCell>
                  <TableCell>
                    <LpfInline summary={summary} />
                  </TableCell>
                  <TableCell className="tnum text-right">{summary.totalEggs}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </main>
  );
}
