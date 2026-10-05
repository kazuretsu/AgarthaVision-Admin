import { Suspense } from "react";
import { getDatabase } from "@/adapters/registry";
import type { ConsoleAccess } from "@/domain";
import { MissingEnvironmentError } from "@/lib/env";
import { requirePageAccess } from "@/lib/console-access";
import { InviteForm } from "@/components/invitations/InvitationForms";
import { InvitationTable } from "@/components/invitations/InvitationTable";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * An org admin's people: invite a medtech into their laboratory and follow the
 * invitations they have sent. Org admins only; a super admin invites an
 * organization's admins from that organization's page.
 *
 * No route-level `loading.tsx`: it would start a 200 response before the access
 * check could answer a super admin with a 404. The page checks first and shows
 * its own skeleton below that, around the one read.
 */
export const dynamic = "force-dynamic";

async function Invitations({
  access,
  organizationId,
  organizationName,
}: {
  access: ConsoleAccess;
  organizationId: string;
  organizationName: string;
}) {
  let invitations;
  try {
    invitations = await (await getDatabase()).listInvitations(organizationId);
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return (
        <p className="text-[13px] text-stone-deep">
          <code className="font-mono">{cause.variable}</code> is not set, so no invitations could be
          read.
        </p>
      );
    }
    throw cause;
  }
  return (
    <InvitationTable
      invitations={invitations}
      access={access}
      caption={`Invitations into ${organizationName}`}
    />
  );
}

export default async function MedtechsPage() {
  const actor = await requirePageAccess(["org_admin"]);
  if (actor.access.kind !== "org_admin") return null;
  const { organizationId, organizationName } = actor.access;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-[22px] font-bold text-stone-ink">Medtechs</h1>
        <p className="text-[13px] text-stone-mid">
          Invite the medical technologists of {organizationName}. Each sets their own password from
          the email and then signs in to the AgarthaVision mobile app.
        </p>
      </header>

      <Card>
        <CardContent>
          <InviteForm organizationId={organizationId} role="medtech" />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-stone-ink">Invitations</h2>
        <Suspense
          fallback={
            <div aria-busy="true" className="flex flex-col gap-2">
              <span className="sr-only">Loading invitations…</span>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          }
        >
          <Invitations
            access={actor.access}
            organizationId={organizationId}
            organizationName={organizationName}
          />
        </Suspense>
      </section>
    </main>
  );
}
