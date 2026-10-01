import type { SupabaseClient } from "@supabase/supabase-js";
import {
  StorageAccessError,
  type SignedUrlOptions,
  type SignedUrl,
  type StoragePort,
} from "@/ports/storage";
import { createRequestClient } from "./client";
import { storageConfig } from "./env";

/**
 * Supabase Storage implementation of {@link StoragePort}.
 *
 * Signs as the signed-in user. The app's `0001_init.sql` grants admins read on
 * every object in the `samples` bucket (`"samples: admin read all"`), so the
 * Storage policy — not this adapter — decides which frames a console user may
 * see. An object the user may not read fails to sign, and the page shows the
 * frame as unavailable rather than borrowing elevated credentials.
 */
export class SupabaseStorageAdapter implements StoragePort {
  constructor(
    private readonly client: SupabaseClient,
    private readonly bucket: string,
    private readonly defaultTtlSeconds: number,
  ) {}

  async createSignedUrl(objectKey: string, options: SignedUrlOptions = {}): Promise<SignedUrl> {
    const key = objectKey.trim();
    if (key.length === 0) {
      throw new StorageAccessError(objectKey, new Error("Object key is empty."));
    }

    const expiresIn = options.expiresInSeconds ?? this.defaultTtlSeconds;
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(key, expiresIn);

    // A missing or unreadable object surfaces as an error here, not as a null
    // URL, so both shapes are treated as failure rather than trusting one of them.
    if (error || !data?.signedUrl) {
      throw new StorageAccessError(key, error);
    }

    return {
      url: data.signedUrl,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }
}

/** Builds the adapter against a request-scoped, session-carrying client. */
export async function createSupabaseStorage(): Promise<StoragePort> {
  const config = storageConfig();
  return new SupabaseStorageAdapter(
    await createRequestClient(),
    config.samplesBucket,
    config.signedUrlTtlSeconds,
  );
}
