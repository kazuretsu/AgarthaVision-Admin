import { optionalEnv, requireEnv } from "@/lib/env";
import { MailSendError, type MailMessage, type MailPort } from "@/ports/mail";

/**
 * Resend implementation of {@link MailPort}, over its HTTP API — one `fetch`, no
 * SDK. The key is server-only (`RESEND_API_KEY`) and read at send time; the
 * sender must be on the domain verified in Resend.
 */

const ENDPOINT = "https://api.resend.com/emails";

/** The console's sender. Not a secret: it appears on every message it sends. */
export const DEFAULT_MAIL_FROM = "AgarthaVision <no-reply@agarthavision.kazuretsu.dev>";

export class ResendMailAdapter implements MailPort {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly post: typeof fetch = fetch,
  ) {}

  async send({ to, subject, text, html }: MailMessage): Promise<void> {
    let response: Response;
    try {
      response = await this.post(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: this.from, to: [to], subject, text, html }),
        cache: "no-store",
      });
    } catch (cause) {
      throw new MailSendError(cause);
    }
    if (!response.ok) {
      throw new MailSendError(`Resend answered ${response.status}: ${await response.text()}`);
    }
  }
}

export function createResendMail(): MailPort {
  return new ResendMailAdapter(
    requireEnv("RESEND_API_KEY"),
    optionalEnv("MAIL_FROM", DEFAULT_MAIL_FROM),
  );
}
