import type { Metadata } from "next";
import Link from "next/link";
import { getOnboarding } from "@/adapters/registry";
import { invitedRoleLabel, type InvitationLink } from "@/domain/invitations";
import { AcceptInvitationError } from "@/ports/onboarding";
import { MissingEnvironmentError } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { AcceptInvitationForm } from "@/components/invitations/AcceptInvitationForm";

/**
 * The page an invitation email opens. Open to anyone holding the link: the token
 * in the path is the permission, so the page never sends it on as a referrer.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Accept invitation · AgarthaVision",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

const CLOSED: Record<Exclude<InvitationLink["state"], "pending">, string> = {
  expired: "This invitation has expired. Ask whoever invited you to send it again.",
  revoked: "This invitation was withdrawn. Ask whoever invited you if you still need access.",
  accepted: "This invitation has already been used.",
  unavailable: "This laboratory is not taking new members right now. Ask whoever invited you.",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-stone-mid uppercase">
          AgarthaVision
        </p>
        <h1 className="text-[26px] leading-8 font-bold text-stone-ink">Accept your invitation</h1>
      </div>
      {children}
    </main>
  );
}

function Notice({ message, signIn }: { message: string; signIn?: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 text-[14px] text-stone-deep">
        <p role="alert">{message}</p>
        {signIn ? (
          <p className="text-[13px] text-stone-mid">
            Organization admins sign in at{" "}
            <Link href="/login" className="text-maroon underline-offset-4 hover:underline">
              the console
            </Link>
            ; medtechs sign in to the AgarthaVision mobile app.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let link;
  try {
    link = await (await getOnboarding()).findInvitation(token);
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return (
        <Shell>
          <Notice message={`Server is not configured: ${cause.variable} is not set.`} />
        </Shell>
      );
    }
    if (cause instanceof AcceptInvitationError) {
      return (
        <Shell>
          <Notice message="This invitation could not be checked right now. Try the link again in a moment." />
        </Shell>
      );
    }
    throw cause;
  }

  if (!link) {
    return (
      <Shell>
        <Notice message="This invitation link is not valid. Use the newest email you received." />
      </Shell>
    );
  }
  if (link.state !== "pending") {
    return (
      <Shell>
        <Notice message={CLOSED[link.state]} signIn={link.state === "accepted"} />
      </Shell>
    );
  }

  const role = invitedRoleLabel(link.role);
  return (
    <Shell>
      <p className="-mt-4 text-[14px] text-stone-deep">
        You are invited to join <strong className="text-stone-ink">{link.organizationName}</strong>{" "}
        as {/^[aeiou]/i.test(role) ? "an" : "a"} {role}. Set a password to finish. This link works
        until {formatDateTime(link.expiresAt)}.
      </p>
      <Card>
        <CardContent>
          <AcceptInvitationForm
            token={token}
            email={link.email}
            fullName={link.fullName}
            role={link.role}
          />
        </CardContent>
      </Card>
    </Shell>
  );
}
