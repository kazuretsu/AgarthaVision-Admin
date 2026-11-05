import { describe, expect, it } from "vitest";
import { passwordChangeFailure } from "./errors";

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
