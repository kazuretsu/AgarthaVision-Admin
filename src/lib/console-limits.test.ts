import { describe, expect, it } from "vitest";
import { INVITEE_NAME_MAX } from "@/domain/invitations";
import { ORGANIZATION_NAME_MAX } from "@/domain/organizations";
import { PROFILE_NAME_MAX } from "@/domain/profile";
import { LIST_PAGE_SIZE, pageRange } from "./pagination";

describe("console limits", () => {
  it("keeps name limits aligned with the database checks", () => {
    expect(ORGANIZATION_NAME_MAX).toBe(120);
    expect(INVITEE_NAME_MAX).toBe(120);
    expect(PROFILE_NAME_MAX).toBe(120);
  });

  it("keeps list pages at 50 rows with the same displayed ranges", () => {
    expect(LIST_PAGE_SIZE).toBe(50);
    expect(pageRange(2, LIST_PAGE_SIZE, 110)).toEqual({ first: 51, last: 100 });
  });
});
