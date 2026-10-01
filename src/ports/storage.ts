/**
 * The file-storage port.
 *
 * Sample frames live in a private bucket keyed `{user_id}/{sample_id}.jpg`. The
 * console never proxies bytes and never exposes a bucket path to the browser: it
 * mints a short-lived signed URL server-side and hands over the URL.
 */

export interface SignedUrl {
  /** Time-limited URL the browser may load directly. */
  url: string;
  /** ISO-8601 instant after which the URL stops working. */
  expiresAt: string;
}

export interface SignedUrlOptions {
  /** Lifetime in seconds. Adapters apply a short default when omitted. */
  expiresInSeconds?: number;
}

export interface StoragePort {
  /**
   * Mints a signed URL for one object key, as the signed-in user. Throws
   * {@link StorageAccessError} when that user may not read the object.
   */
  createSignedUrl(objectKey: string, options?: SignedUrlOptions): Promise<SignedUrl>;
}

/** Thrown when the object is missing, unreadable, or signing failed. */
export class StorageAccessError extends Error {
  constructor(objectKey: string, cause?: unknown) {
    super(`Could not sign a URL for object "${objectKey}".`);
    this.name = "StorageAccessError";
    this.cause = cause;
  }
}
