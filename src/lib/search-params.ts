import { EggSpecies, ValidationStatus, type NumericRange, type RecordFilter } from "@/domain";

/**
 * Filters live in the URL, not in component state.
 *
 * That makes a filtered view shareable and bookmarkable, survives a reload, and
 * lets the export route reuse the page's exact query without a second source of
 * truth for "what is currently on screen".
 */

/** Query keys, named once so the form, the parser and the export link agree. */
export const FILTER_KEYS = {
  from: "from",
  to: "to",
  sampleId: "sample",
  status: "status",
  species: "species",
  owner: "owner",
  confidenceMin: "confMin",
  confidenceMax: "confMax",
  epgMin: "epgMin",
  epgMax: "epgMax",
  timeMin: "timeMin",
  timeMax: "timeMax",
} as const;

/** A blank string is an absent filter, never a filter for the empty value. */
function text(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim();
  return value ? value : undefined;
}

/**
 * Parses a numeric bound. A non-numeric value is dropped rather than coerced:
 * `Number("abc")` is NaN, and a NaN bound would silently reject every row.
 */
function num(params: URLSearchParams, key: string): number | undefined {
  const raw = text(params, key);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function range(params: URLSearchParams, minKey: string, maxKey: string): NumericRange | undefined {
  const min = num(params, minKey);
  const max = num(params, maxKey);
  return min === undefined && max === undefined ? undefined : { min, max };
}

/** Keeps only values the enum actually declares; unknown text is discarded. */
function enumList<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
): T[] | undefined {
  const values = params.getAll(key).filter((value): value is T => allowed.includes(value as T));
  return values.length > 0 ? values : undefined;
}

export function parseRecordFilter(params: URLSearchParams): RecordFilter {
  return {
    capturedFrom: text(params, FILTER_KEYS.from),
    capturedTo: text(params, FILTER_KEYS.to),
    sampleId: text(params, FILTER_KEYS.sampleId),
    ownerId: text(params, FILTER_KEYS.owner),
    validationStatuses: enumList(params, FILTER_KEYS.status, Object.values(ValidationStatus)),
    species: enumList(params, FILTER_KEYS.species, Object.values(EggSpecies)),
    confidence: range(params, FILTER_KEYS.confidenceMin, FILTER_KEYS.confidenceMax),
    epg: range(params, FILTER_KEYS.epgMin, FILTER_KEYS.epgMax),
    processingTimeSeconds: range(params, FILTER_KEYS.timeMin, FILTER_KEYS.timeMax),
  };
}

/** True when nothing is actually constrained, so the UI can say "all records". */
export function isEmptyFilter(filter: RecordFilter): boolean {
  return Object.values(filter).every(
    (value) => value === undefined || (Array.isArray(value) && value.length === 0),
  );
}

/** Next hands `searchParams` as a plain record; normalise it to URLSearchParams. */
export function toSearchParams(
  input: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const item of value) params.append(key, item);
    else params.append(key, value);
  }
  return params;
}
