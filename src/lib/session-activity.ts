/**
 * The console's record of a session's last activity (14zcqntnqpd): an httpOnly cookie the proxy
 * rewrites on each request, HMAC-signed with `CONSOLE_SESSION_SECRET` so it cannot be edited to
 * stretch the idle limit. It names the session it belongs to, so a record left over from an
 * earlier session is ignored rather than ending the new one.
 *
 * Value: `<session id>.<last activity, ms since epoch>.<HMAC-SHA256, base64url>`. Web Crypto, so
 * it runs in the proxy's runtime as well as in tests.
 */

export const ACTIVITY_COOKIE = "av_console_activity";

/** The shortest secret accepted: 32 characters. Anything shorter turns the idle limit off. */
export const ACTIVITY_SECRET_MIN = 32;

/** The secret, or null when it is unset or too short (the idle limit is then off). */
export function activitySecret(value: string | undefined): string | null {
  return value && value.length >= ACTIVITY_SECRET_MIN ? value : null;
}

const encoder = new TextEncoder();

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** The cookie's value for this session at this time. */
export async function signActivity(secret: string, sessionId: string, at: number): Promise<string> {
  const payload = `${sessionId}.${at}`;
  const signature = await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(payload));
  return `${payload}.${toBase64Url(signature)}`;
}

/**
 * The last activity the cookie records for this session: its time; null when there is no
 * cookie or it belongs to another session; "tampered" when it names this session but its
 * signature or shape is wrong.
 */
export async function readActivity(
  secret: string,
  sessionId: string,
  value: string | undefined,
): Promise<number | null | "tampered"> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return "tampered";
  const [session, at, signature] = parts;
  if (session !== sessionId) return null;
  const bytes = fromBase64Url(signature);
  if (!/^\d{1,15}$/.test(at) || !bytes) return "tampered";
  const valid = await crypto.subtle.verify(
    "HMAC",
    await key(secret),
    bytes,
    encoder.encode(`${session}.${at}`),
  );
  return valid ? Number(at) : "tampered";
}
