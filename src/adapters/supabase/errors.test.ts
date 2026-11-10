import { describe, expect, it } from "vitest";
import { passwordChangeFailure, passwordResetFailure } from "./errors";

describe("passwordChangeFailure", () => {
  it("maps Supabase Auth's refusals to reasons the page can explain", () => {
    expect(passwordChangeFailure({ code: "current_password_invalid", status: 400 })).toBe(
      "wrong_current_password",
    );
    expect(passwordChangeFailure({ code: "same_password", status: 422 })).toBe("same_password");
    expect(passwordChangeFailure({ code: "weak_password", status: 422 })).toBe("weak_password");
    expect(passwordChangeFailure({ code: "over_request_rate_limit" })).toBe("rate_limited");
    expect(passwordChangeFailure({ status: 429 })).toBe("rate_limited");
  });

  it("treats anything else as a failure, never as a wrong password", () => {
    expect(passwordChangeFailure({ code: "insufficient_aal", status: 401 })).toBe("failed");
    expect(passwordChangeFailure({ code: "current_password_required" })).toBe("failed");
    expect(passwordChangeFailure(null)).toBe("failed");
  });
});

describe("passwordResetFailure", () => {
  it("maps expired, used and banned links to invalid_link", () => {
    expect(passwordResetFailure({ code: "otp_expired", status: 403 })).toBe("invalid_link");
    expect(passwordResetFailure({ code: "flow_state_not_found", status: 404 })).toBe(
      "invalid_link",
    );
    expect(passwordResetFailure({ code: "bad_code_verifier", status: 400 })).toBe("invalid_link");
    expect(passwordResetFailure({ code: "user_banned", status: 403 })).toBe("invalid_link");
  });

  it("maps password rule and rate-limit refusals", () => {
    expect(passwordResetFailure({ code: "same_password", status: 422 })).toBe("same_password");
    expect(passwordResetFailure({ code: "weak_password", status: 422 })).toBe("weak_password");
    expect(passwordResetFailure({ code: "over_request_rate_limit", status: 429 })).toBe(
      "rate_limited",
    );
    expect(passwordResetFailure({ status: 429 })).toBe("rate_limited");
  });

  it("treats unknown errors as failed", () => {
    expect(passwordResetFailure({ code: "unexpected_failure", status: 500 })).toBe("failed");
    expect(passwordResetFailure(null)).toBe("failed");
  });
});
