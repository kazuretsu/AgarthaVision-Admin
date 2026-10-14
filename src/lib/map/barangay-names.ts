/**
 * Barangay names for the map's city view (14zcqntjnt6), from the 2Q 2026 PSGC release the map's
 * lookup is built from. The database lists a city's barangays by code and has no barangay table
 * by design (admin/0015); `scripts/geo/build-barangay-names.ts` writes these files from the app
 * repo's PSGC list. Server only: one province segment's file is read per city, never the whole
 * release.
 */
const PSGC_CODE = /^\d{10}$/;

type Segment = Record<string, Record<string, string>>;

/** Every barangay of `town`, code → name; empty for a town the release does not hold. */
export async function barangayNamesOf(town: string): Promise<ReadonlyMap<string, string>> {
  if (!PSGC_CODE.test(town)) return new Map();
  let segment: Segment;
  try {
    segment = (await import(`./barangays/q2_2026/${town.slice(0, 5)}.json`)).default as Segment;
  } catch {
    return new Map();
  }
  return new Map(Object.entries(segment[town] ?? {}));
}
