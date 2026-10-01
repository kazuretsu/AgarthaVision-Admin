import Link from "next/link";
import { notFound } from "next/navigation";
import { getDatabase } from "@/adapters/registry";
import {
  DetectionVerdict,
  boxProvenance,
  canonicalSpecies,
  detectionSpecies,
  isCountedDetection,
  isUuid,
  patientDisclosureFor,
  patientLabel,
  sessionLabel,
} from "@/domain";
import { MissingEnvironmentError } from "@/lib/env";
import { ANY_CONSOLE_USER, requirePageAccess } from "@/lib/console-access";
import { formatDateTime, personName } from "@/lib/format";
import { signFrames } from "@/lib/signed-urls";
import { Breadcrumbs } from "@/components/records/Breadcrumbs";
import { fieldBoxes } from "@/components/records/boxes";
import { DataUnavailable } from "@/components/records/DataUnavailable";
import { Fact } from "@/components/records/Fact";
import { FieldImage } from "@/components/records/FieldImage";
import { PROVENANCE_LABEL } from "@/components/records/provenance";
import { SpeciesName } from "@/components/records/SpeciesName";
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
 * One field: the frame, every egg on it, and what the medtech recorded. Each
 * detection says whether its box is the model's, redrawn, or added by the
 * medtech, and its verdict — a rejected box stays visible as evidence and never
 * counts.
 */
export const dynamic = "force-dynamic";

const VERDICT_LABEL: Record<DetectionVerdict, string> = {
  [DetectionVerdict.Confirmed]: "Confirmed",
  [DetectionVerdict.WrongClass]: "Species corrected",
  [DetectionVerdict.BoxIncorrect]: "Box corrected",
  [DetectionVerdict.FalsePositive]: "Rejected",
};

export default async function SamplePage({ params }: { params: Promise<{ sampleId: string }> }) {
  const { sampleId } = await params;
  const actor = await requirePageAccess(ANY_CONSOLE_USER);
  const disclosure = patientDisclosureFor(actor.access);
  // A malformed id names no record; Postgres would reject it as an error.
  if (!isUuid(sampleId)) notFound();

  let record;
  let urls;
  try {
    record = await (await getDatabase()).getSampleRecord(sampleId, disclosure);
    if (!record) notFound();
    urls = await signFrames([record.sample.storagePath]);
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return <DataUnavailable title="Field" variable={cause.variable} />;
    }
    throw cause;
  }

  const { sample, detections, findings, session, patient, author, fieldNumber, fieldCount } =
    record;
  const patientName = patientLabel(patient);
  const sessionTitle = sessionLabel(session, disclosure);
  const counted = detections.filter(isCountedDetection).length;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <Breadcrumbs
        items={[
          { label: "Records", href: "/records" },
          { label: patientName, href: `/records/patients/${patient.id}` },
          { label: sessionTitle, href: `/records/sessions/${session.id}` },
          { label: `Field ${fieldNumber}` },
        ]}
      />

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-bold text-stone-ink">
          Field {fieldNumber} <span className="text-stone-mid">of {fieldCount}</span>
        </h1>
        {sample.isManual ? <Badge variant="neutral">Manual capture</Badge> : null}
        {sample.needsReannotation ? <Badge variant="warn">Model missed eggs</Badge> : null}
      </header>

      <div className="grid grid-cols-[3fr_2fr] gap-6">
        <FieldImage
          url={urls.get(sample.storagePath) ?? null}
          alt={`Field ${fieldNumber} of ${sessionTitle}`}
          boxes={fieldBoxes(record)}
        />
        <Card>
          <CardContent className="grid grid-cols-2 gap-4">
            <Fact label="Read by" value={personName(author)} />
            <Fact label="Captured" value={formatDateTime(sample.capturedAt)} />
            <Fact label="Verified" value={formatDateTime(sample.verifiedAt)} />
            <Fact label="Model" value={sample.inferenceModelVersion ?? "—"} />
            <Fact label="Eggs counted" value={String(counted)} mono />
            <Fact label="Detections" value={String(detections.length)} mono />
            {/* Free text the medtech typed: it can name the patient, so it follows the
                same disclosure as the patient's name. */}
            {sample.userNote && disclosure === "identified" ? (
              <div className="col-span-2">
                <Fact label="Medtech's note" value={sample.userNote} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-stone-ink">Eggs recorded in this field</h2>
        {findings.length === 0 ? (
          <p className="text-[13px] text-stone-mid">No eggs recorded in this field.</p>
        ) : (
          <ul className="flex flex-wrap gap-3 text-[13px] text-stone-deep">
            {findings.map((finding) => (
              <li
                key={`${finding.species}-${finding.stage ?? ""}`}
                className="rounded-[8px] border border-stone-hair bg-surface px-3 py-1.5"
              >
                <SpeciesName species={canonicalSpecies(finding.species)} />
                {finding.stage ? <span className="text-stone-mid"> · {finding.stage}</span> : null}
                <span className="tnum font-semibold text-stone-ink"> {finding.eggCount}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-stone-ink">Detections</h2>
        {detections.length === 0 ? (
          <p className="text-[13px] text-stone-mid">The model found nothing on this field.</p>
        ) : (
          <Table className="min-w-[720px]">
            <TableCaption>Detections on field {fieldNumber}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Species</TableHead>
                <TableHead>Model said</TableHead>
                <TableHead>Verdict</TableHead>
                <TableHead>Box</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Confidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detections.map((detection) => {
                const provenance = boxProvenance(detection, {
                  hasPredictions: record.hasPredictions,
                  isManual: sample.isManual,
                });
                const rejected = !isCountedDetection(detection);
                return (
                  <TableRow key={detection.id} className={rejected ? "text-stone-mid" : undefined}>
                    <TableCell className={rejected ? "line-through" : "text-stone-ink"}>
                      <SpeciesName species={detectionSpecies(detection)} />
                    </TableCell>
                    <TableCell>
                      <SpeciesName species={canonicalSpecies(detection.classLabel)} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={rejected ? "danger" : "neutral"}>
                        {VERDICT_LABEL[detection.verdict]}
                      </Badge>
                    </TableCell>
                    <TableCell title={PROVENANCE_LABEL[provenance].hint}>
                      {PROVENANCE_LABEL[provenance].label}
                    </TableCell>
                    <TableCell>{detection.stage ?? "—"}</TableCell>
                    <TableCell className="tnum text-right">
                      {detection.confidence.toFixed(2)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <p className="text-[12px] text-stone-mid">
          Box: <strong>Model</strong> — the model&apos;s box, kept; <strong>Redrawn</strong> — the
          medtech corrected it; <strong>Added</strong> — an egg the medtech found;{" "}
          <strong>No box</strong> — counted without one; <strong>Unknown</strong> — recorded before
          model output was stored. A rejected detection is kept as evidence and never counted.
        </p>
      </section>

      <nav className="flex justify-between text-[13px]">
        <Link
          href={`/records/sessions/${session.id}`}
          className="text-stone-deep hover:text-maroon"
        >
          ← Back to {sessionTitle}
        </Link>
      </nav>
    </main>
  );
}
