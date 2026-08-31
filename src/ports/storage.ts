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
   * Mints a signed URL for one object key.
   *
   * Known upstream gap: Storage RLS on the `samples` bucket is owner-scoped with
   * no admin exception (`0003_storage_rls.sql`), so this call must run through a
   * server-side client with elevated credentials until the admin read policy
   * lands. Image loading in this console depends on that policy being applied.
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
