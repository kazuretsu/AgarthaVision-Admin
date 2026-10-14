import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { getDatabase } from "@/adapters/registry";
import {
  boundariesFor,
  CHILD_KIND,
  crumbsOf,
  describeFigure,
  drillTarget,
  mapHref,
  namesUnknownOrganization,
  parseMapLocation,
  shadeOf,
  type OrganizationSummary,
  type PrevalenceView,
} from "@/domain";
import { MigrationNotAppliedError } from "@/ports";
import { MissingEnvironmentError } from "@/lib/env";
import { ANY_CONSOLE_USER, requirePageAccess } from "@/lib/console-access";
import { describePeriod, parsePeriod } from "@/lib/period";
import { scopeForRequest } from "@/lib/read-scope";
import { OrganizationFilter } from "@/components/organizations/OrganizationFilter";
import { UnknownOrganizationNotice } from "@/components/organizations/UnknownOrganizationNotice";
import { DataUnavailable } from "@/components/records/DataUnavailable";
import { AreaTable } from "@/components/map/AreaTable";
import { MapLegend } from "@/components/map/MapLegend";
import { PrevalenceMap, type MapArea } from "@/components/map/PrevalenceMap";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * The STH prevalence map (14zcqntjnt3): the share of examined smears that were positive, per
 * region, then a region's provinces, then a province's cities and municipalities.
 *
 * Every figure is the database's (`console_area_prevalence()`, admin/0014), counted on the
 * dashboard's rule and withheld below 5 smears at every level; the page only places them.
 * Where the map is lives in the query string (`region`, `province`), with the period and
 * laboratory, so the back button and a shared link both work.
 *
 * It reads the area before rendering anything, so an unknown region or province is a real 404
 * (`src/app/not-found-status.test.ts`); with no route-level loading state, a click on the map
 * shows its own spinner while the next level is read.
 */
export const dynamic = "force-dynamic";

const PLACE = {
  region: { one: "Region", many: "Regions" },
  province: { one: "Province", many: "Provinces" },
  town: { one: "City or municipality", many: "Cities and municipalities" },
} as const;

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageAccess(ANY_CONSOLE_USER);

  const params = await searchParams;
  const period = parsePeriod(params);
  const location = parseMapLocation(params);
  const { actor, scope } = await scopeForRequest(params.org);
  const org =
    scope.kind === "organization" && actor.access.kind === "super_admin"
      ? scope.organizationId
      : null;
  const keep = { from: period.from, to: period.to, org };

  let view: PrevalenceView | null;
  let organizations: OrganizationSummary[] = [];
  try {
    const db = await getDatabase();
    [view, organizations] = await Promise.all([
      db.areaPrevalence({
        scope,
        location,
        startedFrom: period.from,
        startedTo: period.to,
      }),
      actor.access.kind === "super_admin" ? db.listOrganizations() : Promise.resolve([]),
    ]);
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return <DataUnavailable title="Prevalence map" variable={cause.variable} />;
    }
    if (cause instanceof MigrationNotAppliedError) {
      return (
        <main className="mx-auto w-full max-w-6xl px-6 py-10">
          <h1 className="text-[22px] font-bold text-stone-ink">Prevalence map</h1>
          <p className="mt-3 text-[14px] text-stone-deep">{cause.message}</p>
        </main>
      );
    }
    throw cause;
  }
  if (!view) notFound();
  const unknownOrganization = namesUnknownOrganization(actor.access, scope, organizations);

  const kind = CHILD_KIND[view.level];
  const hrefOf = (code: string) => {
    const target = drillTarget(view.level, code);
    return target ? mapHref(target, keep) : null;
  };
  const areas: MapArea[] = view.areas.map((area) => ({
    code: area.code,
    name: area.name,
    shade: shadeOf(area.figure),
    summary: describeFigure(area.figure),
    href: hrefOf(area.code),
  }));
  const crumbs = crumbsOf(view);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] font-bold text-stone-ink">Prevalence map</h1>
          <p className="max-w-2xl text-[13px] text-stone-mid">
            Share of examined smears positive for STH, {describePeriod(period)}, by where the
            patient lives. A smear counts once a field was verified and is positive when any egg was
            counted, as on the dashboard.
          </p>
        </div>
        <form className="flex flex-wrap items-end gap-2">
          {location.code ? (
            <input type="hidden" name={location.level} value={location.code} />
          ) : null}
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-stone-deep">From</span>
            <Input type="date" name="from" defaultValue={period.from} className="w-40" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-stone-deep">To</span>
            <Input type="date" name="to" defaultValue={period.to} className="w-40" />
          </label>
          {actor.access.kind === "super_admin" ? (
            <OrganizationFilter organizations={organizations} scope={scope} />
          ) : null}
          <Button type="submit" variant="outline">
            Apply
          </Button>
          {period.from || period.to || params.org ? (
            <Link
              href={mapHref(location, {})}
              className="px-2 text-[13px] text-stone-mid hover:text-maroon"
            >
              Reset
            </Link>
          ) : null}
        </form>
      </header>

      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((crumb, index) => (
            <Fragment key={`${crumb.level}:${crumb.code ?? ""}`}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem>
                {index < crumbs.length - 1 ? (
                  <BreadcrumbLink
                    render={<Link href={mapHref({ level: crumb.level, code: crumb.code }, keep)} />}
                  >
                    {crumb.name}
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{crumb.name}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      {unknownOrganization ? (
        <UnknownOrganizationNotice />
      ) : (
        <div className="grid grid-cols-[3fr_2fr] items-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{view.name}</CardTitle>
              <CardDescription data-testid="area-figure">
                {describeFigure(view.figure)}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <PrevalenceMap
                boundaries={boundariesFor(location)}
                areas={areas}
                label={`${view.name}: positive smears by ${PLACE[kind].one.toLowerCase()}. The table lists every figure.`}
              />
              <MapLegend />
              {view.unplaced ? (
                <p className="text-[12px] text-stone-deep" data-testid="unplaced">
                  {view.unplaced.toLocaleString()} examined{" "}
                  {view.unplaced === 1 ? "smear is" : "smears are"} not on the map: the
                  patient&apos;s barangay code matches no city or municipality in the 2Q 2026 PSGC.
                </p>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{PLACE[kind].many}</CardTitle>
              <CardDescription>
                {kind === "town"
                  ? "Every city and municipality in the province."
                  : `Open one to see its ${PLACE[CHILD_KIND[kind]].many.toLowerCase()}.`}
              </CardDescription>
            </CardHeader>
            {/* A province can have 60 towns: the list scrolls beside the map, not past it. */}
            <CardContent className="max-h-[640px] overflow-y-auto">
              <AreaTable kind={PLACE[kind].one} areas={view.areas} hrefOf={hrefOf} />
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
