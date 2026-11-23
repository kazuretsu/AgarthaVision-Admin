import type { Metadata } from "next";
import { headers } from "next/headers";
import { ReportCheckView } from "@/components/report-check/ReportCheckView";
import { clientIp } from "@/lib/attempt-limit";
import { checkReportLink } from "@/lib/report-check";

/**
 * Where a report's QR code leads (14zcqnty9bj). Public on purpose, the console's one page
 * outside its sign-in gate besides the sign-in and invitation pages (constraint #3): the
 * reader holds a printed report, not a console account. It lives outside `(dashboard)`, so the
 * gate in that layout never runs here, and it names no patient or medtech (constraint #14).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Report check · AgarthaVision",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ReportCheckPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const state = await checkReportLink(await searchParams, clientIp(await headers()));
  return <ReportCheckView state={state} />;
}
