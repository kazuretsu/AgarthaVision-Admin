"use client";

import { useSearchParams } from "next/navigation";

/**
 * Says why the person is back on `/login` when the proxy ended their console session for its
 * time limits (14zcqntnqpd): it redirects here with `?session=ended`.
 */
export function SessionEndedNotice() {
  const ended = useSearchParams().get("session") === "ended";
  if (!ended) return null;
  return (
    <p role="status" className="text-[13px] text-stone-deep">
      Your session ended. Sign in again.
    </p>
  );
}
