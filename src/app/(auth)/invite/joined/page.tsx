import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Where a medtech lands after accepting: their place is the mobile app, so they
 * are signed out of the console and told where to go. A page of its own rather
 * than a state of the form, because signing out refreshes the invitation page,
 * which by then reads "already used".
 */
export const metadata: Metadata = {
  title: "You're in · AgarthaVision",
  robots: { index: false, follow: false },
};

export default function JoinedPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-stone-mid uppercase">
          AgarthaVision
        </p>
        <h1 className="text-[26px] leading-8 font-bold text-stone-ink">You&apos;re in</h1>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-2 text-[14px] text-stone-deep">
          <p role="status">Your password is set and you have joined your laboratory.</p>
          <p>
            Open the AgarthaVision app on your phone and sign in with the email this invitation was
            sent to and the password you just chose.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
