import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { Card, CardContent } from "@/components/ui/card";

/**
 * The page a password-reset email opens (14zcqntjnt9).
 *
 * The single-use `code` (PKCE redirect from `{{ .ConfirmationURL }}`) or `token_hash` in the
 * query string is the permission, so the page never sends it on as a referrer and is not
 * indexed. Consuming the token happens in the server action when the form is submitted, so
 * opening the page or fixing a password typo does not spend the single-use link.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set a new password · AgarthaVision",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

function firstString(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return undefined;
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolved = await searchParams;
  const code = firstString(resolved.code);
  const tokenHash = firstString(resolved.token_hash);
  const providerError = firstString(resolved.error) ?? firstString(resolved.error_code);
  const hasValidParams = !providerError && (Boolean(code) || Boolean(tokenHash));

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-stone-mid uppercase">
          AgarthaVision
        </p>
        <h1 className="text-[26px] leading-8 font-bold text-stone-ink">Set a new password</h1>
        <p className="text-[13px] text-stone-mid">
          Choose a new password for your AgarthaVision account.
        </p>
      </div>

      <Card>
        <CardContent>
          {hasValidParams ? (
            <ResetPasswordForm code={code} tokenHash={tokenHash} />
          ) : (
            <div className="flex flex-col gap-3 text-[14px] text-stone-deep">
              <p role="alert">
                This password reset link is not valid or has expired. Request a new one.
              </p>
              <p className="text-[13px] text-stone-mid">
                <Link href="/forgot-password" className="font-medium text-teal hover:underline">
                  Request a new reset link
                </Link>
                {" · "}
                <Link href="/login" className="font-medium text-teal hover:underline">
                  Back to sign in
                </Link>
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

