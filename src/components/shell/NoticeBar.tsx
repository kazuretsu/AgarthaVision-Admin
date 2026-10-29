"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Info, ShieldAlert, TriangleAlert, X } from "lucide-react";
import {
  noticeCookieName,
  noticeDismissal,
  shownOn,
  type Notice,
  type NoticeTone,
} from "@/domain/notices";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * The notices strip across the top of every console page (14zcqntr35f). The layout passes the
 * notices that apply and that this admin has not closed; this hides any on the page its action
 * opens, and remembers a close in a cookie for the notice's snooze, so the server leaves it out
 * from the next page on. One notice per row, stacked.
 */

const VARIANT = { info: "default", warning: "warning", danger: "destructive" } as const;
const ICON = { info: Info, warning: TriangleAlert, danger: ShieldAlert } as const;

/** A danger interrupts a screen reader; anything else waits its turn. */
function roleFor(tone: NoticeTone): "alert" | "status" {
  return tone === "danger" ? "alert" : "status";
}

/** Remembers on this browser that this admin closed the notice, for its snooze. */
function rememberClosed(notice: Notice, userId: string): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${noticeCookieName(notice.id)}=${noticeDismissal(userId, Date.now())}; ` +
    `Max-Age=${notice.snoozeDays * 24 * 60 * 60}; Path=/; SameSite=Lax${secure}`;
}

export function NoticeBar({ notices, userId }: { notices: Notice[]; userId: string }) {
  const pathname = usePathname();
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const shown = notices.filter((notice) => !closed.has(notice.id) && shownOn(notice, pathname));
  if (shown.length === 0) return null;

  function close(notice: Notice) {
    rememberClosed(notice, userId);
    setClosed((previous) => new Set(previous).add(notice.id));
  }

  return (
    <div className="flex flex-col gap-2 px-6 pt-4">
      {shown.map((notice) => {
        const Icon = ICON[notice.tone];
        return (
          <Alert key={notice.id} variant={VARIANT[notice.tone]} role={roleFor(notice.tone)}>
            <Icon aria-hidden />
            <AlertTitle>{notice.title}</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-2 [&_a]:no-underline [&_p:not(:last-child)]:mb-0">
              <p>{notice.message}</p>
              {notice.action ? (
                <Link
                  href={notice.action.href}
                  className={buttonVariants({ size: "sm", variant: "outline" })}
                >
                  {notice.action.label}
                </Link>
              ) : null}
            </AlertDescription>
            {notice.dismissible ? (
              <AlertAction>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={`Close “${notice.title}” for ${notice.snoozeDays} days`}
                  onClick={() => close(notice)}
                >
                  <X aria-hidden />
                </Button>
              </AlertAction>
            ) : null}
          </Alert>
        );
      })}
    </div>
  );
}
