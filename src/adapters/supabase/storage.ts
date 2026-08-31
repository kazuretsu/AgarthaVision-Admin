import type { SupabaseClient } from "@supabase/supabase-js";
import {
  StorageAccessError,
  type SignedUrlOptions,
  type SignedUrl,
  type StoragePort,
} from "@/ports/storage";
import { createServiceClient } from "./client";
import { serviceConfig } from "./env";

/**
 * Supabase Storage implementation of {@link StoragePort}.
 *
 * Unlike the database adapter, this one runs with the service-role key. That is
 * not a convenience: `0003_storage_rls.sql` scopes SELECT on the `samples`
 * bucket to `(storage.foldername(name))[1] = auth.uid()`, with no admin
 * exception, so an admin's own session cannot read a frame captured by any other
 * medtech. Until the admin read policy lands upstream, signing server-side is
 * the only way this console can render an image it is entitled to show.
 *
 * Two things keep that narrow. The key never leaves the server — this module is
 * imported only from server components and route handlers. And the caller is
 * expected to have passed `requireAdmin()` first: this adapter mints a URL for
 * whatever key it is given and performs no authorisation of its own.
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

    // A missing object surfaces as an error here, not as a null URL, so both
    // shapes are treated as failure rather than trusting one of them.
    if (error || !data?.signedUrl) {
      throw new StorageAccessError(key, error);
    }

    return {
      url: data.signedUrl,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }
}

/** Builds the adapter against the server-only, service-role client. */
export function createSupabaseStorage(): StoragePort {
  const config = serviceConfig();
  return new SupabaseStorageAdapter(
    createServiceClient(),
    config.samplesBucket,
    config.signedUrlTtlSeconds,
  );
}
