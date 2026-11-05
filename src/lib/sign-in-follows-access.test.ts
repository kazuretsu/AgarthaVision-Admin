import { describe, expect, it, vi } from "vitest";
import { signInFollowsAccess } from "./sign-in-follows-access";

function fakes(logins: { userId: string; accountId: string }[], failing: string[] = []) {
  const recorded: unknown[] = [];
  const changes: [string, boolean][] = [];
  const writes = {
    recordSignInChange: vi.fn(async (userIds: readonly string[], block: boolean, cause: string) => {
      recorded.push({ userIds, block, cause });
      return logins;
    }),
  };
  const access = {
    setSignInAllowed: vi.fn(async (accountId: string, allowed: boolean) => {
      if (failing.includes(accountId)) throw new Error("provider down");
      changes.push([accountId, allowed]);
    }),
  };
  return { writes, access, recorded, changes };
}

describe("signInFollowsAccess", () => {
  it("blocks exactly the logins the database names, after recording them", async () => {
    // b still has access elsewhere, so the database leaves them out.
    const { writes, access, recorded, changes } = fakes([{ userId: "a", accountId: "acct-a" }]);
    await expect(
      signInFollowsAccess(writes, access, ["a", "b"], true, "organization.deactivate"),
    ).resolves.toEqual({ changed: 1, failed: 0 });
    expect(recorded).toEqual([
      { userIds: ["a", "b"], block: true, cause: "organization.deactivate" },
    ]);
    expect(changes).toEqual([["acct-a", false]]);
  });

  it("allows the logins named on the way back", async () => {
    const { writes, access, changes } = fakes([
      { userId: "a", accountId: "acct-a" },
      { userId: "c", accountId: "acct-c" },
    ]);
    await signInFollowsAccess(writes, access, ["a", "c"], false, "organization.reactivate");
    expect(changes).toEqual([
      ["acct-a", true],
      ["acct-c", true],
    ]);
  });

  it("changes nobody who keeps access", async () => {
    const { writes, access } = fakes([]);
    await expect(
      signInFollowsAccess(writes, access, ["still-a-member"], true, "super_admin.revoke"),
    ).resolves.toEqual({ changed: 0, failed: 0 });
    expect(access.setSignInAllowed).not.toHaveBeenCalled();
  });

  it("counts a login the provider fails to change, and carries on with the rest", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { writes, access, changes } = fakes(
      [
        { userId: "a", accountId: "acct-a" },
        { userId: "b", accountId: "acct-b" },
      ],
      ["acct-a"],
    );
    await expect(
      signInFollowsAccess(writes, access, ["a", "b"], true, "organization.deactivate"),
    ).resolves.toEqual({ changed: 1, failed: 1 });
    expect(changes).toEqual([["acct-b", false]]);
  });

  it("asks nothing when there is nobody", async () => {
    const { writes, access } = fakes([]);
    await signInFollowsAccess(writes, access, [], true, "organization.deactivate");
    expect(writes.recordSignInChange).not.toHaveBeenCalled();
  });

  it("changes nothing when the record cannot be written", async () => {
    const { access } = fakes([]);
    const writes = { recordSignInChange: vi.fn(async () => Promise.reject(new Error("db"))) };
    await expect(signInFollowsAccess(writes, access, ["a"], true, "x")).rejects.toThrow("db");
    expect(access.setSignInAllowed).not.toHaveBeenCalled();
  });
});
