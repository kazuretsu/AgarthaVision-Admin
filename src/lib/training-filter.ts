import {
  DEFAULT_TRAINING_FILTER,
  MAX_HELD_OUT_PERCENT,
  TRAINING_CLASSES,
  isTrainingClass,
  isUuid,
  type TrainingFilter,
} from "@/domain";
import { parsePeriod } from "./period";

/**
 * The training data page's filter in the query string, so a preview is a link and the
 * snapshot is built from exactly the filter the preview showed. Anything malformed is
 * dropped to its default rather than guessed at.
 *
 * `lab`, `class` and `model` repeat; none means all. `hn`, `reannotate`,
 * `background` and `unboxed` are `1` or `0` (the checkboxes submit `0` unchecked); `val` and `test`
 * are whole percentages of patients, each at most {@link MAX_HELD_OUT_PERCENT}.
 */

type Params = Record<string, string | string[] | undefined>;

function all(value: string | string[] | undefined): string[] {
  return (Array.isArray(value) ? value : value === undefined ? [] : [value])
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function first(value: string | string[] | undefined): string | undefined {
  return all(value)[0];
}

function flag(value: string | string[] | undefined, fallback: boolean): boolean {
  const raw = first(value);
  if (raw === "1") return true;
  if (raw === "0") return false;
  return fallback;
}

function percent(value: string | string[] | undefined, fallback: number): number {
  const raw = first(value);
  if (!raw || !/^\d{1,2}$/.test(raw)) return fallback;
  const parsed = Number(raw);
  return parsed <= MAX_HELD_OUT_PERCENT ? parsed : fallback;
}

export function parseTrainingFilter(params: Params): TrainingFilter {
  const period = parsePeriod(params);
  const asked = new Set(all(params.class));
  const classes = TRAINING_CLASSES.filter((name) => asked.has(name) && isTrainingClass(name));
  return {
    ...period,
    organizationIds: [...new Set(all(params.lab).filter(isUuid))],
    classes: classes.length > 0 ? classes : [...TRAINING_CLASSES],
    modelVersions: [...new Set(all(params.model).filter((version) => version.length <= 200))],
    includeHardNegatives: flag(params.hn, DEFAULT_TRAINING_FILTER.includeHardNegatives),
    includeReannotation: flag(params.reannotate, DEFAULT_TRAINING_FILTER.includeReannotation),
    includeBackground: flag(params.background, DEFAULT_TRAINING_FILTER.includeBackground),
    includeUnboxed: flag(params.unboxed, DEFAULT_TRAINING_FILTER.includeUnboxed),
    valPercent: percent(params.val, DEFAULT_TRAINING_FILTER.valPercent),
    testPercent: percent(params.test, DEFAULT_TRAINING_FILTER.testPercent),
  };
}

/** The filter as a query string, which {@link parseTrainingFilter} reads back unchanged. */
export function trainingFilterQuery(filter: TrainingFilter): URLSearchParams {
  const query = new URLSearchParams();
  if (filter.from) query.set("from", filter.from);
  if (filter.to) query.set("to", filter.to);
  filter.organizationIds.forEach((id) => query.append("lab", id));
  if (filter.classes.length < TRAINING_CLASSES.length) {
    filter.classes.forEach((name) => query.append("class", name));
  }
  filter.modelVersions.forEach((version) => query.append("model", version));
  query.set("hn", filter.includeHardNegatives ? "1" : "0");
  query.set("reannotate", filter.includeReannotation ? "1" : "0");
  query.set("background", filter.includeBackground ? "1" : "0");
  query.set("unboxed", filter.includeUnboxed ? "1" : "0");
  query.set("val", String(filter.valPercent));
  query.set("test", String(filter.testPercent));
  return query;
}

/** The same, from a query string (the create form posts the preview's). */
export function trainingFilterFromQuery(query: string): TrainingFilter {
  const params: Params = {};
  for (const [key, value] of new URLSearchParams(query)) {
    const existing = params[key];
    params[key] = existing === undefined ? value : [...all(existing), value];
  }
  return parseTrainingFilter(params);
}
