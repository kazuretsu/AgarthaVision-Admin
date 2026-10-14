import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { getDatabase } from "@/adapters/registry";
import {
  barangayBreakdown,
  boundariesFor,
  CHILD_KIND,
  crumbsOf,
  describeFigure,
  drillTarget,
  mapHref,
  MIN_REPORTABLE_SMEARS,
  namesUnknownOrganization,
  parseIsolate,
  parseMapLocation,
  shadeOf,
  type OrganizationSummary,
  type PrevalenceView,
} from "@/domain";
import { MigrationNotAppliedError } from "@/ports";
import { MissingEnvironmentError } from "@/lib/env";
import { ANY_CONSOLE_USER, requirePageAccess } from "@/lib/console-access";
import { barangayNamesOf } from "@/lib/map/barangay-names";
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
 * region, then a region's provinces, then a province's cities and municipalities, then one
 * city's barangays as a ranked table, since there are no barangay outlines (14zcqntjnt6).
 *
 * Every figure is the database's (`console_area_prevalence()`, admin/0014 and 0015), counted on
 * the dashboard's rule and withheld below 5 smears at every level, barangays included; the page
 * only places them and names the barangays from the same PSGC release. Where the map is lives
 * in the query string (`region`, `province`, `town`), with the period, laboratory and any area
 * isolated on the map (`isolate`), so the back button and a shared link both work.
 *
 * It reads the area before rendering anything, so an unknown region, province or town is a real
 * 404 (`src/app/not-found-status.test.ts`); with no route-level loading state, a click on the
 * map shows its own spinner while the next level is read.
 */
export const dynamic = "force-dynamic";

const PLACE = {
  region: { one: "Region", many: "Regions" },
  province: { one: "Province", many: "Provinces" },
  town: { one: "City or municipality", many: "Cities and municipalities" },
  barangay: { one: "Barangay", many: "Barangays" },
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
  let barangayNames: ReadonlyMap<string, string> | null = null;
  try {
    const db = await getDatabase();
    [view, organizations, barangayNames] = await Promise.all([
      db.areaPrevalence({
        scope,
        location,
        startedFrom: period.from,
        startedTo: period.to,
      }),
      actor.access.kind === "super_admin" ? db.listOrganizations() : Promise.resolve([]),
      location.level === "town" && location.code
        ? barangayNamesOf(location.code)
        : Promise.resolve(null),
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
  /** What opening one of the listed areas shows; a barangay opens nothing. */
  const below = kind === "barangay" ? null : PLACE[CHILD_KIND[kind]];
  const hrefOf = (code: string) => {
    const target = drillTarget(view.level, code);
    return target ? mapHref(target, keep) : null;
  };
  // A town is drawn alone with its own figure; its barangays are a table, never map areas.
  const breakdown = barangayNames ? barangayBreakdown(view.areas, barangayNames) : null;
  const isolated = breakdown ? null : parseIsolate(params, view.areas);
  const isolatedName = view.areas.find((area) => area.code === isolated)?.name;
  const clearHref = mapHref(location, keep);
  const areas: MapArea[] = breakdown
    ? [
        {
          code: location.code ?? "",
          name: view.name,
          shade: shadeOf(view.figure),
          summary: describeFigure(view.figure),
          href: null,
        },
      ]
    : view.areas.map((area) => ({
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
          {isolated ? <input type="hidden" name="isolate" value={isolated} /> : null}
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
              href={mapHref(location, { isolate: isolated })}
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
        // Side by side only where both fit: below 1400px the table's columns crush the map.
        <div className="grid grid-cols-1 items-start gap-6 min-[1400px]:grid-cols-[3fr_2fr]">
          <Card>
            <CardHeader>
              <CardTitle>{view.name}</CardTitle>
              <CardDescription data-testid="area-figure">
                {describeFigure(view.figure)}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {isolatedName ? (
                <p className="text-[13px] text-stone-deep" data-testid="isolated">
                  Showing only <span className="font-medium text-stone-ink">{isolatedName}</span>.{" "}
                  <Link href={clearHref} className="text-maroon hover:underline">
                    Show all {PLACE[kind].many.toLowerCase()}
                  </Link>
                </p>
              ) : null}
              <PrevalenceMap
                boundaries={boundariesFor(view, isolated)}
                areas={areas}
                label={
                  breakdown
                    ? `${view.name}: positive smears in the ${PLACE.town.one.toLowerCase()}. The table lists its barangays.`
                    : `${view.name}: positive smears by ${PLACE[kind].one.toLowerCase()}. The table lists every figure.`
                }
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
                {breakdown
                  ? "Barangays with a smear examined, highest prevalence first."
                  : `Open one to see its ${below?.many.toLowerCase()}, or isolate it on the map.`}
              </CardDescription>
            </CardHeader>
            {/* A province can have 60 towns: the list scrolls beside the map, not past it. */}
            <CardContent className="flex max-h-[640px] flex-col gap-3 overflow-y-auto">
              {breakdown ? (
                <>
                  {breakdown.rows.length ? (
                    <AreaTable
                      kind={PLACE.barangay.one}
                      areas={breakdown.rows}
                      hrefOf={() => null}
                      caption={`A barangay with fewer than ${MIN_REPORTABLE_SMEARS} smears examined shows no figures.`}
                    />
                  ) : null}
                  <p className="text-[12px] text-stone-deep" data-testid="without-smears">
                    {breakdown.rows.length === 0
                      ? `None of its ${breakdown.withoutSmears.toLocaleString()} barangays had a smear examined.`
                      : `${breakdown.withoutSmears.toLocaleString()} other ${breakdown.withoutSmears === 1 ? "barangay" : "barangays"} had no smear examined.`}
                  </p>
                </>
              ) : (
                <AreaTable
                  kind={PLACE[kind].one}
                  areas={view.areas}
                  hrefOf={hrefOf}
                  isolate={{
                    hrefOf: (code) => mapHref(location, { ...keep, isolate: code }),
                    current: isolated,
                    clearHref,
                  }}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
