/**
 * Display formatting for clinical dates and times, in the clinical frame
 * (Asia/Manila) the app records them in.
 */
const DATE = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "short",
  day: "numeric",
});

const DATE_TIME = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatDate(instant: string | null): string {
  return instant ? DATE.format(new Date(instant)) : "—";
}

export function formatDateTime(instant: string | null): string {
  return instant ? DATE_TIME.format(new Date(instant)) : "—";
}

/** A birthdate is a calendar date with no zone; format it without shifting a day. */
export function formatBirthdate(date: string): string {
  return DATE.format(new Date(`${date}T12:00:00+08:00`));
}

/** A person's name, or a plain fallback when their profile has none. */
export function personName(person: { fullName: string | null } | null): string {
  return person?.fullName?.trim() || "Unnamed user";
}
