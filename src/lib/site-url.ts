import { optionalEnv } from "./env";

/**
 * The console's public origin, for links that leave it (an invitation email).
 *
 * `CONSOLE_URL` wins when set, so an email never carries whatever host a request
 * happened to name. Without it, the origin is the request's own, as Vercel
 * forwards it. Called inside a request only.
 */
export async function consoleOrigin(): Promise<string> {
  const configured = optionalEnv("CONSOLE_URL", "");
  if (configured) return new URL(configured).origin;

  const { headers } = await import("next/headers");
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost:3000";
  const protocol =
    incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return new URL(`${protocol}://${host}`).origin;
}

/** The page an invitation link opens. */
export function invitationLink(origin: string, token: string): string {
  return `${origin}/invite/${token}`;
}
