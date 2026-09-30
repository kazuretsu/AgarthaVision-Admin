import type { SampleDetail } from "@/domain";
import { boxProvenance, detectionSpecies, isCountedDetection } from "@/domain";
import type { FieldBox } from "./FieldImage";

/** The drawable boxes on one field. A detection with no box has nothing to draw. */
export function fieldBoxes(detail: SampleDetail): FieldBox[] {
  return detail.detections.flatMap((detection) => {
    const { bboxX: x, bboxY: y, bboxW: w, bboxH: h } = detection;
    if (x === null || y === null || w === null || h === null) return [];
    return [
      {
        id: detection.id,
        x,
        y,
        w,
        h,
        counted: isCountedDetection(detection),
        provenance: boxProvenance(detection, {
          hasPredictions: detail.hasPredictions,
          isManual: detail.sample.isManual,
        }),
        label: detectionSpecies(detection),
      },
    ];
  });
}
