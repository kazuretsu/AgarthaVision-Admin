import { describe, expect, it } from "vitest";
import { activitySecret, readActivity, signActivity } from "./session-activity";

const SECRET = "a".repeat(32);
const SESSION = "4f1c2a8e-0000-4000-8000-000000000001";

describe("the activity cookie", () => {
  it("reads back the time it was signed with", async () => {
    const value = await signActivity(SECRET, SESSION, 1_700_000_000_000);
    expect(await readActivity(SECRET, SESSION, value)).toBe(1_700_000_000_000);
  });

  it("is tampered when its time is edited", async () => {
    const value = await signActivity(SECRET, SESSION, 1_700_000_000_000);
    const edited = value.replace("1700000000000", "1800000000000");
    expect(await readActivity(SECRET, SESSION, edited)).toBe("tampered");
  });

  it("is tampered when signed with another secret", async () => {
    const value = await signActivity("b".repeat(32), SESSION, 1);
    expect(await readActivity(SECRET, SESSION, value)).toBe("tampered");
  });

  it("is tampered when its shape is wrong", async () => {
    expect(await readActivity(SECRET, SESSION, "garbage")).toBe("tampered");
    expect(await readActivity(SECRET, SESSION, `${SESSION}.12x.abc`)).toBe("tampered");
    expect(await readActivity(SECRET, SESSION, `${SESSION}.12.a+b`)).toBe("tampered");
  });

  it("is ignored when absent, or left from another session", async () => {
    expect(await readActivity(SECRET, SESSION, undefined)).toBe(null);
    const other = await signActivity(SECRET, "another-session", 1);
    expect(await readActivity(SECRET, SESSION, other)).toBe(null);
  });
});

describe("activitySecret", () => {
  it("accepts 32 characters or more, and nothing shorter", () => {
    expect(activitySecret(SECRET)).toBe(SECRET);
    expect(activitySecret("short")).toBe(null);
    expect(activitySecret(undefined)).toBe(null);
  });
});
