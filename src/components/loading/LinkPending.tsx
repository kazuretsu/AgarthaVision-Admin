"use client";

import { useLinkStatus } from "next/link";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * A spinner beside a link's label while its navigation is pending. Render it inside
 * a `<Link>`. It covers the wait a skeleton cannot: a record or person page reads
 * its record and decides 404 before anything streams, so until then the clicked link
 * itself shows the click registered (14zcqntk6h5).
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <Spinner
      aria-label="Opening…"
      className={cn("ml-1.5 inline size-3.5 align-[-2px]", className)}
    />
  ) : null;
}
