import type { Profile, RecordFilter } from "@/domain";
import { EggSpecies, ValidationStatus } from "@/domain";
import { FILTER_KEYS } from "@/lib/search-params";

/**
 * The advanced filter panel (SRS Module 4).
 *
 * A plain GET form, so the current view is a URL: shareable, bookmarkable, and
 * reusable by the export links without a second definition of "what is on
 * screen". No client JavaScript is needed for it to work.
 */

const STATUS_LABEL: Record<ValidationStatus, string> = {
  [ValidationStatus.Validated]: "Validated",
  [ValidationStatus.Pending]: "Pending",
  [ValidationStatus.Flagged]: "Flagged",
};

const FIELD =
  "rounded-[8px] border border-stone-hair bg-surface px-2.5 py-1.5 text-[13px] text-stone-ink outline-none focus:border-maroon";
const LABEL = "text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-mid";

export function RecordsFilters({
  filter,
  owners,
}: {
  filter: RecordFilter;
  owners: Pick<Profile, "id" | "fullName">[];
}) {
  return (
    <form method="get" className="rounded-[12px] border border-stone-hair bg-surface p-4">
      <div className="grid grid-cols-4 gap-3">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Captured from</span>
          <input
            type="date"
            name={FILTER_KEYS.from}
            defaultValue={filter.capturedFrom ?? ""}
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Captured to</span>
          <input
            type="date"
            name={FILTER_KEYS.to}
            defaultValue={filter.capturedTo ?? ""}
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Sample ID</span>
          <input
            type="search"
            name={FILTER_KEYS.sampleId}
            defaultValue={filter.sampleId ?? ""}
            placeholder="Any part of the UUID"
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Medical technologist</span>
          <select name={FILTER_KEYS.owner} defaultValue={filter.ownerId ?? ""} className={FIELD}>
            <option value="">Everyone</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.fullName ?? owner.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="flex flex-col gap-1.5 border-0 p-0">
          <legend className={LABEL}>Validation status</legend>
          {Object.values(ValidationStatus).map((status) => (
            <label key={status} className="flex items-center gap-2 text-[13px] text-stone-deep">
              <input
                type="checkbox"
                name={FILTER_KEYS.status}
                value={status}
                defaultChecked={filter.validationStatuses?.includes(status) ?? false}
                className="accent-maroon"
              />
              {STATUS_LABEL[status]}
            </label>
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-1.5 border-0 p-0">
          <legend className={LABEL}>Detected species</legend>
          {Object.values(EggSpecies).map((species) => (
            <label key={species} className="flex items-center gap-2 text-[13px] text-stone-deep">
              <input
                type="checkbox"
                name={FILTER_KEYS.species}
                value={species}
                defaultChecked={filter.species?.includes(species) ?? false}
                className="accent-maroon"
              />
              {species}
            </label>
          ))}
        </fieldset>

        <div className="flex flex-col gap-3">
          <RangeField
            label="AI confidence (0–1)"
            minName={FILTER_KEYS.confidenceMin}
            maxName={FILTER_KEYS.confidenceMax}
            min={filter.confidence?.min}
            max={filter.confidence?.max}
            step="0.01"
          />
          <RangeField
            label="Validated EPG"
            minName={FILTER_KEYS.epgMin}
            maxName={FILTER_KEYS.epgMax}
            min={filter.epg?.min}
            max={filter.epg?.max}
          />
        </div>

        <div className="flex flex-col gap-3">
          <RangeField
            label="Processing time (s)"
            minName={FILTER_KEYS.timeMin}
            maxName={FILTER_KEYS.timeMax}
            min={filter.processingTimeSeconds?.min}
            max={filter.processingTimeSeconds?.max}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          className="rounded-[8px] bg-maroon px-4 py-2 text-[13px] font-semibold text-primary-foreground"
        >
          Apply filters
        </button>
        {/* A link, not a reset button: reset would restore the submitted values,
            which is not what "clear" means to anyone reading it. */}
        <a href="/records" className="text-[13px] text-stone-mid hover:text-maroon">
          Clear
        </a>
      </div>
    </form>
  );
}

function RangeField({
  label,
  minName,
  maxName,
  min,
  max,
  step,
}: {
  label: string;
  minName: string;
  maxName: string;
  min?: number;
  max?: number;
  step?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className={LABEL}>{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          name={minName}
          step={step}
          defaultValue={min ?? ""}
          placeholder="Min"
          className={`${FIELD} w-full`}
        />
        <span className="text-[12px] text-stone-mid">to</span>
        <input
          type="number"
          name={maxName}
          step={step}
          defaultValue={max ?? ""}
          placeholder="Max"
          className={`${FIELD} w-full`}
        />
      </div>
    </div>
  );
}
