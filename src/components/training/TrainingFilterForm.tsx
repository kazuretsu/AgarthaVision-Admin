import Link from "next/link";
import {
  MAX_HELD_OUT_PERCENT,
  TRAINING_CLASSES,
  type OrganizationSummary,
  type TrainingFilter,
} from "@/domain";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

/**
 * The training data filter, a GET form: the preview is a link, and the snapshot is
 * built from the same query. Each list submits what is ticked; none ticked means all.
 * The options submit `0` when unticked, so "off" survives the round trip.
 */
export function TrainingFilterForm({
  filter,
  organizations,
  modelVersions,
  unboxedAvailable,
}: {
  filter: TrainingFilter;
  organizations: OrganizationSummary[];
  modelVersions: { modelVersion: string; frames: number }[];
  /** admin/0013 is applied, so a frame kept with unboxed eggs can be stored as incomplete. */
  unboxedAvailable: boolean;
}) {
  return (
    <form className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-stone-deep">Sessions from</span>
          <Input type="date" name="from" defaultValue={filter.from} className="w-40" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-stone-deep">To</span>
          <Input type="date" name="to" defaultValue={filter.to} className="w-40" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-stone-deep">Validation, % of patients</span>
          <Input
            type="number"
            name="val"
            min={0}
            max={MAX_HELD_OUT_PERCENT}
            defaultValue={filter.valPercent}
            className="w-28"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-stone-deep">Test, % of patients</span>
          <Input
            type="number"
            name="test"
            min={0}
            max={MAX_HELD_OUT_PERCENT}
            defaultValue={filter.testPercent}
            className="w-28"
          />
        </label>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <CheckList
          legend="Species"
          name="class"
          options={TRAINING_CLASSES.map((name) => ({
            value: name,
            label: name,
            italic: name !== "Hookworm",
          }))}
          checked={filter.classes.length === TRAINING_CLASSES.length ? [] : filter.classes}
          allLabel="All three"
        />
        <CheckList
          legend="Laboratories"
          name="lab"
          options={organizations.map((organization) => ({
            value: organization.id,
            label:
              organization.status === "deactivated"
                ? `${organization.name} (deactivated)`
                : organization.name,
          }))}
          checked={filter.organizationIds}
          allLabel="All laboratories"
        />
        <CheckList
          legend="Model versions"
          name="model"
          options={modelVersions.map((row) => ({
            value: row.modelVersion,
            label: row.modelVersion,
            note: `${row.frames.toLocaleString()} frame${row.frames === 1 ? "" : "s"}`,
            mono: true,
          }))}
          checked={filter.modelVersions}
          allLabel="All versions"
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[12px] font-medium text-stone-deep">Include</legend>
          <Option
            name="hn"
            checked={filter.includeHardNegatives}
            label="Hard negatives"
            note="Rejected boxes, listed in the manifest"
          />
          <Option
            name="background"
            checked={filter.includeBackground}
            label="Background frames"
            note="Verified frames with no egg"
          />
          <Option
            name="reannotate"
            checked={filter.includeReannotation}
            label="Frames flagged for re-annotation"
            note="The medtech said the model missed eggs"
          />
          <Option
            name="unboxed"
            checked={filter.includeUnboxed}
            disabled={!unboxedAvailable}
            label="Frames with unboxed eggs"
            note={
              unboxedAvailable
                ? "Eggs counted but never boxed stay unlabelled; marked incomplete"
                : "Needs admin/0013 applied in the SQL editor"
            }
          />
        </fieldset>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="outline">
          Preview
        </Button>
        <Link href="/training-data" className="px-2 text-[13px] text-stone-mid hover:text-maroon">
          Reset
        </Link>
      </div>
    </form>
  );
}

interface CheckOption {
  value: string;
  label: string;
  note?: string;
  italic?: boolean;
  mono?: boolean;
}

function CheckList({
  legend,
  name,
  options,
  checked,
  allLabel,
}: {
  legend: string;
  name: string;
  options: CheckOption[];
  /** What is ticked; empty means all, and nothing is ticked. */
  checked: readonly string[];
  allLabel: string;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-[12px] font-medium text-stone-deep">
        {legend}{" "}
        <span className="font-normal text-stone-mid">· none ticked: {allLabel.toLowerCase()}</span>
      </legend>
      {options.length === 0 ? (
        <p className="text-[13px] text-stone-mid">None yet.</p>
      ) : (
        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
          {options.map((option) => (
            <label key={option.value} className="flex items-start gap-2 text-[13px] text-stone-ink">
              <Checkbox
                name={name}
                value={option.value}
                defaultChecked={checked.includes(option.value)}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span
                  className={
                    option.italic
                      ? "italic"
                      : option.mono
                        ? "font-mono text-[12px] break-all"
                        : undefined
                  }
                >
                  {option.label}
                </span>
                {option.note ? (
                  <span className="block text-[12px] text-stone-mid">{option.note}</span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function Option({
  name,
  checked,
  label,
  note,
  disabled = false,
}: {
  name: string;
  checked: boolean;
  label: string;
  note: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-2 text-[13px] text-stone-ink">
      <Checkbox
        name={name}
        value="1"
        uncheckedValue="0"
        defaultChecked={checked}
        disabled={disabled}
        className="mt-0.5"
      />
      <span>
        {label}
        <span className="block text-[12px] text-stone-mid">{note}</span>
      </span>
    </label>
  );
}
