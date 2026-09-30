import { isBinomial } from "@/domain";

/** A species name, italic when it is a binomial (Hookworm is not). */
export function SpeciesName({ species }: { species: string }) {
  return <span className={isBinomial(species) ? "binomial" : undefined}>{species}</span>;
}
