import type { NextRequest, NextResponse } from "next/server";

/**
 * The session as the proxy sees it on one request (14zcqntnqpd): refreshed if it had to be,
 * with what the console's session limits need. Kept apart from {@link AuthPort} because the
 * proxy runs before any page, reads and writes the request's cookies itself, and must not pay
 * for a database read.
 */
export interface RequestSession {
  /** Stable for the life of the session; changes when the person signs in again. */
  id: string;
  /** When the person signed in (ms since epoch), or null when the provider cannot say. */
  signedInAt: number | null;
}

export interface RequestSessionPort {
  /** The request's session after any refresh, or null when there is none. */
  readonly session: RequestSession | null;
  /**
   * Ends this browser's session only, at the provider and in its cookies. Never the account's
   * other sessions: the mobile app on the same account stays signed in.
   */
  endSession(): Promise<void>;
  /** The response to send on, carrying any cookies the steps above set. */
  response(): NextResponse;
}

/** Builds a {@link RequestSessionPort} for one request. */
export type OpenRequestSession = (request: NextRequest) => Promise<RequestSessionPort>;
