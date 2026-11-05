import type { BoxProvenance } from "@/domain";

/** How each box origin is named on screen, with what it means. */
export const PROVENANCE_LABEL: Record<BoxProvenance, { label: string; hint: string }> = {
  model: { label: "Model", hint: "The model's box, kept by the medtech" },
  redrawn: { label: "Redrawn", hint: "The medtech redrew a misplaced box" },
  unlocated: { label: "No box", hint: "Counted without a box" },
  added: { label: "Added", hint: "An egg the medtech found and drew" },
  unknown: { label: "Unknown", hint: "Recorded before model output was stored" },
};
