import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountAccessError, type AccountAccessPort } from "@/ports/account-access";
import { MissingEnvironmentError } from "./env";
import { withSignInChange } from "./with-sign-in-change";

function fakes() {
  const setSignInAllowed = vi
    .fn<AccountAccessPort["setSignInAllowed"]>()
    .mockResolvedValue(undefined);
  const getAccess = vi.fn().mockResolvedValue({ setSignInAllowed });
  const write = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  return { getAccess, setSignInAllowed, write };
}

afterEach(() => vi.restoreAllMocks());

describe("withSignInChange", () => {
  it("blocks sign-in before writing the record", async () => {
    const { getAccess, setSignInAllowed, write } = fakes();

    await expect(withSignInChange("account", false, getAccess, write)).resolves.toBeNull();

    expect(setSignInAllowed).toHaveBeenCalledExactlyOnceWith("account", false);
    expect(setSignInAllowed).toHaveBeenCalledBefore(write);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("skips the write if the provider refuses the sign-in change", async () => {
    const { getAccess, setSignInAllowed, write } = fakes();
    const cause = new AccountAccessError();
    setSignInAllowed.mockRejectedValueOnce(cause);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(withSignInChange("account", false, getAccess, write)).resolves.toBe(
      "sign_in_not_changed",
    );

    expect(setSignInAllowed).toHaveBeenCalledExactlyOnceWith("account", false);
    expect(write).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledExactlyOnceWith("Sign-in setting not changed", cause);
  });

  it("skips the write if the sign-in provider cannot be configured", async () => {
    const { getAccess, setSignInAllowed, write } = fakes();
    const cause = new MissingEnvironmentError("SUPABASE_SERVICE_ROLE_KEY");
    getAccess.mockRejectedValueOnce(cause);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(withSignInChange("account", true, getAccess, write)).resolves.toBe(
      "sign_in_not_changed",
    );

    expect(setSignInAllowed).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledExactlyOnceWith("Sign-in setting not changed", cause);
  });

  it("propagates unexpected sign-in errors without writing", async () => {
    const { getAccess, setSignInAllowed, write } = fakes();
    const cause = new Error("Unexpected sign-in error");
    setSignInAllowed.mockRejectedValueOnce(cause);

    await expect(withSignInChange("account", false, getAccess, write)).rejects.toBe(cause);

    expect(setSignInAllowed).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
  });

  it.each([false, true])("undoes sign-in allowed=%s when the write fails", async (allowed) => {
    const { getAccess, setSignInAllowed, write } = fakes();
    const cause = new Error("Database write failed");
    write.mockRejectedValueOnce(cause);

    await expect(withSignInChange("account", allowed, getAccess, write)).rejects.toBe(cause);

    expect(getAccess).toHaveBeenCalledTimes(1);
    expect(setSignInAllowed).toHaveBeenCalledTimes(2);
    expect(setSignInAllowed).toHaveBeenNthCalledWith(1, "account", allowed);
    expect(setSignInAllowed).toHaveBeenNthCalledWith(2, "account", !allowed);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.invocationCallOrder[0]).toBeLessThan(
      setSignInAllowed.mock.invocationCallOrder[1],
    );
  });

  it("logs a failed undo and rethrows the original write error", async () => {
    const { getAccess, setSignInAllowed, write } = fakes();
    const cause = new Error("Database write failed");
    const undo = new AccountAccessError();
    write.mockRejectedValueOnce(cause);
    setSignInAllowed.mockResolvedValueOnce(undefined).mockRejectedValueOnce(undo);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(withSignInChange("account", false, getAccess, write)).rejects.toBe(cause);

    expect(setSignInAllowed).toHaveBeenNthCalledWith(2, "account", true);
    expect(log).toHaveBeenCalledExactlyOnceWith("Sign-in change not undone", undo);
  });

  it("writes the record without looking up the provider when the login was deleted", async () => {
    const { getAccess, setSignInAllowed, write } = fakes();

    await expect(withSignInChange(null, false, getAccess, write)).resolves.toBeNull();

    expect(write).toHaveBeenCalledTimes(1);
    expect(getAccess).not.toHaveBeenCalled();
    expect(setSignInAllowed).not.toHaveBeenCalled();
  });

  it("propagates the write error without looking up the provider when the login was deleted", async () => {
    const { getAccess, write } = fakes();
    const cause = new Error("Database write failed");
    write.mockRejectedValueOnce(cause);

    await expect(withSignInChange(null, false, getAccess, write)).rejects.toBe(cause);

    expect(write).toHaveBeenCalledTimes(1);
    expect(getAccess).not.toHaveBeenCalled();
  });
});
