import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvitationLink } from "@/domain/invitations";
import {
  AcceptInvitationError,
  type AcceptInvitationFailure,
  type AcceptInvitationRequest,
  type OnboardingPort,
} from "@/ports/onboarding";
import { createRequestClient, createServiceClient } from "./client";

/**
 * Supabase implementation of {@link OnboardingPort}.
 *
 * Accepting runs in three steps, each checked by the one before:
 *
 * 1. The link is looked up (`console_invitation_by_token`, admin/0005). Only a
 *    pending invitation goes further.
 * 2. The account is made for **the invitation's email**, never one the visitor
 *    typed, with the service-role client — the only use of it in the console. No
 *    `user_metadata` is written: nothing about the account's access lives there.
 *    If the email already has an account (a retry after a failed step 3), that
 *    account is used instead, and no second one is made.
 * 3. The visitor signs in as that account with the password they chose, and
 *    `console_accept_invitation` — run as them — adds the membership the
 *    invitation names and records it in the audit trail.
 */

interface LinkRow {
  email: string;
  full_name: string | null;
  role: string;
  organization_name: string;
  state: string;
  expires_at: string;
}

const LINK_STATES = new Set(["pending", "expired", "accepted", "revoked", "unavailable"]);

/** A link token as `console_new_invitation_token` mints it. Anything else names nothing. */
export function isInvitationToken(token: string): boolean {
  return /^[0-9a-f]{64}$/.test(token);
}

/** Supabase Auth's "this email is taken", across the codes its versions have used. */
function isEmailTaken(error: { code?: string; message?: string }): boolean {
  return error.code === "email_exists" || /already (been )?registered/i.test(error.message ?? "");
}

/** The `HINT` an acceptance refusal carries, mapped to a reason the page can explain. */
function acceptFailure(error: { code?: string; hint?: string }): AcceptInvitationFailure {
  switch (error.hint) {
    case "expired":
    case "revoked":
    case "accepted":
    case "unavailable":
    case "already_member":
      return error.hint;
  }
  return error.code === "P0002" ? "invalid_link" : "failed";
}

export class SupabaseOnboardingAdapter implements OnboardingPort {
  constructor(
    private readonly client: SupabaseClient,
    private readonly service: () => SupabaseClient,
  ) {}

  async findInvitation(token: string): Promise<InvitationLink | null> {
    if (!isInvitationToken(token)) return null;
    const { data, error } = await this.client.rpc("console_invitation_by_token", {
      p_token: token,
    });
    if (error) throw new AcceptInvitationError("failed", error);
    const row = ((data as LinkRow[] | null) ?? [])[0];
    if (!row) return null;
    return {
      email: row.email,
      fullName: row.full_name,
      role: row.role === "org_admin" ? "org_admin" : "medtech",
      organizationName: row.organization_name,
      state: (LINK_STATES.has(row.state) ? row.state : "unavailable") as InvitationLink["state"],
      expiresAt: row.expires_at,
    };
  }

  async acceptInvitation({ token, password, fullName }: AcceptInvitationRequest) {
    const link = await this.findInvitation(token);
    if (!link) throw new AcceptInvitationError("invalid_link");
    if (link.state !== "pending") throw new AcceptInvitationError(link.state);

    const created = await this.service().auth.admin.createUser({
      email: link.email,
      password,
      // The link was emailed to this address, so opening it proves the address.
      email_confirm: true,
    });
    const existing = created.error !== null && isEmailTaken(created.error);
    if (created.error && !existing) {
      throw new AcceptInvitationError(
        created.error.code === "weak_password" ? "weak_password" : "failed",
        created.error,
      );
    }

    const signedIn = await this.client.auth.signInWithPassword({ email: link.email, password });
    if (signedIn.error || !signedIn.data.user) {
      throw new AcceptInvitationError(existing ? "wrong_password" : "failed", signedIn.error);
    }

    const { error } = await this.client.rpc("console_accept_invitation", {
      p_token: token,
      p_full_name: fullName,
    });
    if (error) {
      // Leave no session behind for an account that joined nothing.
      await this.client.auth.signOut();
      throw new AcceptInvitationError(acceptFailure(error), error);
    }
    return { role: link.role };
  }
}

/** Builds the adapter: the visitor's own client, and the privileged one made only when needed. */
export async function createSupabaseOnboarding(): Promise<OnboardingPort> {
  return new SupabaseOnboardingAdapter(await createRequestClient(), createServiceClient);
}
