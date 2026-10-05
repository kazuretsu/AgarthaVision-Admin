import { describe, expect, it } from "vitest";
import { MailSendError } from "@/ports/mail";
import { ResendMailAdapter } from "./mail";

const MESSAGE = { to: "ana@example.test", subject: "S", text: "T", html: "<p>H</p>" };

function recorder(response: Response | Error) {
  const calls: { url: string; init: RequestInit }[] = [];
  const post = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
  }) as unknown as typeof fetch;
  return { calls, post };
}

describe("ResendMailAdapter", () => {
  it("posts one message from the configured sender, with the key as a bearer token", async () => {
    const { calls, post } = recorder(new Response("{}", { status: 200 }));
    await new ResendMailAdapter("key-not-real", "AV <no-reply@example.test>", post).send(MESSAGE);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(
      "Bearer key-not-real",
    );
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      from: "AV <no-reply@example.test>",
      to: ["ana@example.test"],
      subject: "S",
      text: "T",
      html: "<p>H</p>",
    });
  });

  it("a refusal or a network failure is a MailSendError", async () => {
    const refused = recorder(new Response("bad", { status: 422 }));
    await expect(new ResendMailAdapter("k", "f", refused.post).send(MESSAGE)).rejects.toThrow(
      MailSendError,
    );
    const offline = recorder(new Error("offline"));
    await expect(new ResendMailAdapter("k", "f", offline.post).send(MESSAGE)).rejects.toThrow(
      MailSendError,
    );
  });
});
