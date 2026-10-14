import { getConsoleActor } from "@/lib/console-access";
import { navFor } from "@/components/shell/nav";
import { BackToSection } from "@/components/shell/BackToSection";

/**
 * What a console page shows when it answers 404 (14zcqntk6h4): a record that does not exist,
 * a malformed ID, another laboratory's record, or a page the visitor's role cannot open. Every
 * reason reads the same, so nothing here tells which records exist. The status stays 404: the
 * pages decide it before anything streams (`src/app/not-found-status.test.ts`).
 */
export default async function DashboardNotFound() {
  // The layout has read the visitor already; this is the same request's cached lookup.
  const items = navFor((await getConsoleActor()).access.kind);
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="text-[20px] font-bold text-stone-ink">This page isn&apos;t available</h1>
      <p className="mt-3 text-[14px] text-stone-deep">
        What you&apos;re looking for may not exist, or may belong to another laboratory.
      </p>
      <div className="mt-6">
        <BackToSection items={items} />
      </div>
    </main>
  );
}
