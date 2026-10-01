/**
 * A reporting period from the query string: two optional Manila calendar dates.
 * Anything that is not a real `YYYY-MM-DD` date is dropped rather than guessed at,
 * and a reversed pair is swapped, so a mistyped URL narrows nothing by accident.
 */
export interface Period {
  from?: string;
  to?: string;
}

function isDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function first(value: string | string[] | undefined): string | undefined {
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

export function parsePeriod(params: Record<string, string | string[] | undefined>): Period {
  const from = first(params.from);
  const to = first(params.to);
  const period: Period = {
    from: isDate(from) ? from : undefined,
    to: isDate(to) ? to : undefined,
  };
  if (period.from && period.to && period.from > period.to) {
    return { from: period.to, to: period.from };
  }
  return period;
}

export function describePeriod(period: Period): string {
  if (period.from && period.to) return `${period.from} to ${period.to}`;
  if (period.from) return `from ${period.from}`;
  if (period.to) return `up to ${period.to}`;
  return "all time";
}
