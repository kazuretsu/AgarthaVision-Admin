import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDatabase } from "@/adapters/registry";
import {
  canonicalSpecies,
  isCountedDetection,
  isUuid,
  patientDisclosureFor,
  patientLabel,
  sessionLabel,
  type SampleDetail,
} from "@/domain";
import { MissingEnvironmentError } from "@/lib/env";
import { ANY_CONSOLE_USER, requirePageAccess } from "@/lib/console-access";
import { scopeForRequest } from "@/lib/read-scope";
import { formatDateTime, personName } from "@/lib/format";
import { signFrames } from "@/lib/signed-urls";
import { Breadcrumbs } from "@/components/records/Breadcrumbs";
import { fieldBoxes } from "@/components/records/boxes";
import { DataUnavailable } from "@/components/records/DataUnavailable";
import { Fact } from "@/components/records/Fact";
import { FieldImage } from "@/components/records/FieldImage";
import { FramesFallback } from "@/components/records/FramesFallback";
import { LpfTable } from "@/components/records/LpfTable";
import { ResultBadge } from "@/components/records/ResultBadge";
import { SpeciesName } from "@/components/records/SpeciesName";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

/**
 * One session — one smear — as the app's Session Detail shows it: the per-species
 * LPF range and egg count, then every live field. A field deleted as a duplicate
 * is not listed and changes no figure.
 *
 * The record is read, and a missing one answers 404, before anything streams.
 * Only the frames, which take a moment to sign, render inside a Suspense boundary.
 */
export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const actor = await requirePageAccess(ANY_CONSOLE_USER);
  // A malformed id names no record; Postgres would reject it as an error.
  if (!isUuid(sessionId)) notFound();
  const { scope } = await scopeForRequest();

  let record;
  try {
    record = await (
      await getDatabase()
    ).getSessionRecord(sessionId, scope, patientDisclosureFor(actor.access));
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return <DataUnavailable title="Session" variable={cause.variable} />;
    }
    throw cause;
  }
  if (!record) notFound();

  const { session, patient, author, samples, summary } = record;
  const patientName = patientLabel(patient);
  const title = sessionLabel(session, patientDisclosureFor(actor.access));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <Breadcrumbs
        items={[
          { label: "Records", href: "/records" },
          { label: patientName, href: `/records/patients/${patient.id}` },
          { label: title },
        ]}
      />

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-bold text-stone-ink">{title}</h1>
        {summary.fieldCount > 0 ? <ResultBadge positive={summary.isPositive} /> : null}
      </header>

      <Card>
        <CardContent className="grid grid-cols-5 gap-4">
          <Fact
            label="Patient"
            value={
              <Link href={`/records/patients/${patient.id}`} className="hover:text-maroon">
                {patientName}
              </Link>
            }
          />
          <Fact label="Read by" value={personName(author)} />
          <Fact label="Started" value={formatDateTime(session.startedAt)} />
          <Fact label="Fields examined" value={String(summary.fieldCount)} mono />
          <Fact label="Eggs counted" value={String(summary.totalEggs)} mono />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-stone-ink">Findings</h2>
        <LpfTable summary={summary} />
        <p className="text-[12px] text-stone-mid">
          LPF = eggs per low-power field (direct smear): the lowest to the highest count in any
          single field, where a field without the species counts as 0. The descriptor is read off
          the worst field. Every detection except a rejected one counts.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-stone-ink">Fields</h2>
        {samples.length === 0 ? (
          <p className="rounded-[12px] border border-stone-hair bg-surface p-6 text-[13px] text-stone-mid">
            No verified fields in this session yet.
          </p>
        ) : (
          <Suspense fallback={<FramesFallback count={Math.min(samples.length, 6)} columns={3} />}>
            <SessionFields samples={samples} title={title} />
          </Suspense>
        )}
      </section>
    </main>
  );
}

/** The session's fields with their frames, signed as the visitor. */
async function SessionFields({ samples, title }: { samples: SampleDetail[]; title: string }) {
  let urls: Map<string, string | null>;
  try {
    urls = await signFrames(samples.map((detail) => detail.sample.storagePath));
  } catch (cause) {
    // No storage configured: every frame shows as unavailable, the figures stay.
    if (!(cause instanceof MissingEnvironmentError)) throw cause;
    urls = new Map();
  }

  return (
    <ul className="grid grid-cols-3 gap-4">
      {samples.map((detail, index) => {
        const counted = detail.detections.filter(isCountedDetection);
        const fieldEggs = new Map<string, number>();
        for (const finding of detail.findings) {
          // Named the way the sample page and the LPF table name it.
          const species = canonicalSpecies(finding.species);
          fieldEggs.set(species, (fieldEggs.get(species) ?? 0) + finding.eggCount);
        }
        return (
          <li key={detail.sample.id}>
            <Link
              href={`/records/samples/${detail.sample.id}`}
              className="flex flex-col gap-2 rounded-[12px] border border-stone-hair bg-surface p-3 hover:border-maroon"
            >
              <FieldImage
                url={urls.get(detail.sample.storagePath) ?? null}
                alt={`Field ${index + 1} of ${title}`}
                boxes={fieldBoxes(detail)}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-stone-ink">Field {index + 1}</span>
                <span className="tnum text-[12px] text-stone-mid">
                  {counted.length} egg{counted.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {detail.sample.isManual ? <Badge variant="neutral">Manual</Badge> : null}
                {detail.sample.needsReannotation ? (
                  <Badge variant="warn">Model missed eggs</Badge>
                ) : null}
              </div>
              {fieldEggs.size > 0 ? (
                <ul className="text-[12px] text-stone-deep">
                  {[...fieldEggs.entries()].map(([species, count]) => (
                    <li key={species}>
                      <SpeciesName species={species} />{" "}
                      <span className="tnum text-stone-mid">{count} in this field</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-[12px] text-stone-mid">No eggs recorded</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
