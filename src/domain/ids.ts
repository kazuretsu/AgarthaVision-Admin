/**
 * Record ids are Postgres `uuid`s. One that is not well-formed names no record,
 * so a page treats it as absent rather than sending it to the database, which
 * would reject it with an error (`22P02`) and turn a typo into a 500.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID.test(value);
}
