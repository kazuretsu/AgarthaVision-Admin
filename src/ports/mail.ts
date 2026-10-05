/**
 * The mail port: sends one message from the console's own domain.
 *
 * Only the server sends mail, and only for invitations today. The provider's key
 * is a server-only secret read by the adapter at send time.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface MailPort {
  /** Sends the message, or throws {@link MailSendError}. */
  send(message: MailMessage): Promise<void>;
}

/** The provider refused or failed to accept the message. */
export class MailSendError extends Error {
  constructor(cause?: unknown) {
    super("The email could not be sent.");
    this.name = "MailSendError";
    this.cause = cause;
  }
}
