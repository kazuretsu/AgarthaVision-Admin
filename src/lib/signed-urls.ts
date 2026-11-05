import { getStorage } from "@/adapters/registry";
import { StorageAccessError } from "@/ports/storage";

/**
 * Signs each object key as the signed-in user. A frame the user may not read, or
 * one missing from the bucket, becomes `null` and renders as unavailable — one
 * unreadable frame must not take the whole page down.
 */
export async function signFrames(keys: string[]): Promise<Map<string, string | null>> {
  const storage = await getStorage();
  const entries = await Promise.all(
    keys.map(async (key): Promise<[string, string | null]> => {
      try {
        return [key, (await storage.createSignedUrl(key)).url];
      } catch (cause) {
        if (cause instanceof StorageAccessError) return [key, null];
        throw cause;
      }
    }),
  );
  return new Map(entries);
}
