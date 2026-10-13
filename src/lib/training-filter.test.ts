import { describe, expect, it } from "vitest";
import { DEFAULT_TRAINING_FILTER } from "@/domain";
import {
  parseTrainingFilter,
  trainingFilterFromQuery,
  trainingFilterQuery,
} from "./training-filter";

const LAB = "3f2b6c1e-0a4d-4e7f-9a1b-2c3d4e5f6a7b";

describe("training filter in the query string", () => {
  it("defaults to everything, hard negatives and background on, 70/15/15", () => {
    expect(parseTrainingFilter({})).toEqual({ ...DEFAULT_TRAINING_FILTER });
  });

  it("reads repeated labs, classes and models, keeping class order fixed", () => {
    const filter = parseTrainingFilter({
      lab: [LAB, "not-a-uuid", LAB],
      class: ["Hookworm", "Ascaris lumbricoides", "Taenia"],
      model: ["yolo-v1", " ", "yolo-v2"],
    });
    expect(filter.organizationIds).toEqual([LAB]);
    expect(filter.classes).toEqual(["Ascaris lumbricoides", "Hookworm"]);
    expect(filter.modelVersions).toEqual(["yolo-v1", "yolo-v2"]);
  });

  it("reads switched-off options and refuses percentages out of range", () => {
    const filter = parseTrainingFilter({
      hn: "0",
      reannotate: "1",
      background: "0",
      val: "20",
      test: "75",
    });
    expect(filter).toMatchObject({
      includeHardNegatives: false,
      includeReannotation: true,
      includeBackground: false,
      valPercent: 20,
      testPercent: 15,
    });
  });

  it("round-trips through the query string", () => {
    const filter = parseTrainingFilter({
      from: "2026-09-01",
      to: "2026-09-30",
      lab: LAB,
      class: "Trichuris trichiura",
      model: "yolo-v1",
      hn: "0",
      val: "10",
      test: "20",
    });
    expect(trainingFilterFromQuery(trainingFilterQuery(filter).toString())).toEqual(filter);
  });
});
