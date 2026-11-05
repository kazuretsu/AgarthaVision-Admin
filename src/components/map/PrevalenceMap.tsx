"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type {
  ExpressionSpecification,
  GeoJSONSourceSpecification,
  Map as MapLibreMap,
  MapLayerMouseEvent,
} from "maplibre-gl";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState, useTransition } from "react";
import type { AreaShade, BoundarySource } from "@/domain";
import { MAP_PALETTE, shadeColor, type MapPalette } from "@/lib/map/palette";
import { Spinner } from "@/components/ui/spinner";

/** One shaded area: its code in the boundary file, and what the readout says about it. */
export interface MapArea {
  code: string;
  name: string;
  shade: AreaShade;
  summary: string;
  /** Where a click leads; null for a town, which has nothing below it. */
  href: string | null;
}

interface FeatureCollection {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    properties: Record<string, string>;
    geometry: { type: string; coordinates: unknown };
  }[];
}

const HATCH = "too-few-hatch";

/** The country, for a boundary file that comes back empty. */
const PHILIPPINES: [[number, number], [number, number]] = [
  [116.5, 4.5],
  [127, 21],
];

function boundsOf(collection: FeatureCollection): [[number, number], [number, number]] | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const visit = (value: unknown) => {
    if (typeof (value as unknown[])[0] === "number") {
      const [lng, lat] = value as number[];
      west = Math.min(west, lng);
      east = Math.max(east, lng);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    } else (value as unknown[]).forEach(visit);
  };
  for (const feature of collection.features) visit(feature.geometry.coordinates);
  return Number.isFinite(west)
    ? [
        [west, south],
        [east, north],
      ]
    : null;
}

/** An 8×8 diagonal hatch on the "too few" fill, so it never reads as a rate or as no data. */
function hatch(palette: MapPalette) {
  const size = 8;
  const data = new Uint8Array(size * size * 4);
  const rgb = (color: string) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  const base = rgb(palette.tooFew);
  const line = rgb(palette.hatch);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = (x + y) % size < 2 ? line : base;
      data.set([r, g, b, 255], (y * size + x) * 4);
    }
  }
  return { width: size, height: size, data };
}

/**
 * The prevalence map: MapLibre on a plain background, no basemap and no tiles, so nothing is
 * fetched from anyone but this site. Draws one level's areas from the boundary file, shaded
 * by `areas`; pointing at an area names it and its figure, a click opens the level below.
 * The figures are the server's; this only paints them. The table beside it carries the same
 * figures for keyboard and screen-reader use.
 */
export function PrevalenceMap({
  boundaries,
  areas,
  label,
}: {
  boundaries: BoundarySource;
  areas: MapArea[];
  label: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [hovered, setHovered] = useState<MapArea | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [opening, startOpening] = useTransition();
  // `areas` compared by value: a re-render with the same figures must not rebuild the map.
  const areasKey = JSON.stringify(areas);
  const filterKey = boundaries.filter ? `${boundaries.filter.key}=${boundaries.filter.value}` : "";

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const shown: MapArea[] = JSON.parse(areasKey);
    const palette = MAP_PALETTE[resolvedTheme === "dark" ? "dark" : "light"];
    const byCode = new Map(shown.map((area) => [area.code, area]));
    const [filterField, filterValue] = filterKey ? filterKey.split("=") : [null, null];
    let map: MapLibreMap | null = null;
    let cancelled = false;

    (async () => {
      try {
        const [maplibre, response] = await Promise.all([
          import("maplibre-gl"),
          fetch(boundaries.url),
        ]);
        if (!response.ok) throw new Error(`${boundaries.url}: ${response.status}`);
        const all = (await response.json()) as FeatureCollection;
        if (cancelled) return;
        const data: FeatureCollection = filterField
          ? {
              type: "FeatureCollection",
              features: all.features.filter((f) => f.properties[filterField] === filterValue),
            }
          : all;

        maplibre.setWorkerUrl(
          `/vendor/maplibre-gl/${maplibre.getVersion()}/maplibre-gl-worker.mjs`,
        );
        map = new maplibre.Map({
          container: element,
          style: {
            version: 8,
            sources: {},
            layers: [
              {
                id: "background",
                type: "background",
                paint: { "background-color": palette.background },
              },
            ],
          },
          bounds: boundsOf(data) ?? PHILIPPINES,
          fitBoundsOptions: { padding: 24 },
          attributionControl: false,
          renderWorldCopies: false,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
        });
        map.touchZoomRotate.disableRotation();
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");

        map.on("load", () => {
          if (!map) return;
          map.addImage(HATCH, hatch(palette));
          map.addSource("areas", {
            type: "geojson",
            data: data as GeoJSONSourceSpecification["data"],
            promoteId: "code",
          });
          map.addLayer({
            id: "areas-fill",
            type: "fill",
            source: "areas",
            paint: {
              "fill-color": shown.length
                ? ([
                    "match",
                    ["get", "code"],
                    ...shown.flatMap((area) => [area.code, shadeColor(palette, area.shade)]),
                    palette.none,
                  ] as unknown as ExpressionSpecification)
                : palette.none,
            },
          });
          map.addLayer({
            id: "areas-too-few",
            type: "fill",
            source: "areas",
            filter: [
              "in",
              ["get", "code"],
              ["literal", shown.filter((area) => area.shade === "too_few").map((a) => a.code)],
            ],
            paint: { "fill-pattern": HATCH },
          });
          map.addLayer({
            id: "areas-outline",
            type: "line",
            source: "areas",
            paint: { "line-color": palette.outline, "line-width": 0.8 },
          });
          map.addLayer({
            id: "areas-hover",
            type: "line",
            source: "areas",
            paint: {
              "line-color": palette.hover,
              "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2.5, 0],
            },
          });

          let current: string | null = null;
          const highlight = (code: string | null) => {
            if (!map || code === current) return;
            if (current) map.setFeatureState({ source: "areas", id: current }, { hover: false });
            if (code) map.setFeatureState({ source: "areas", id: code }, { hover: true });
            current = code;
            const area = code ? (byCode.get(code) ?? null) : null;
            setHovered(area);
            map.getCanvas().style.cursor = area?.href ? "pointer" : "";
          };
          const codeAt = (event: MapLayerMouseEvent) =>
            (event.features?.[0]?.properties?.code as string | undefined) ?? null;
          map.on("mousemove", "areas-fill", (event) => highlight(codeAt(event)));
          map.on("mouseleave", "areas-fill", () => highlight(null));
          map.on("click", "areas-fill", (event) => {
            const code = codeAt(event);
            const href = code ? byCode.get(code)?.href : null;
            if (href) startOpening(() => router.push(href));
          });
          setState("ready");
        });
      } catch (cause) {
        console.error("prevalence map", cause);
        if (!cancelled) setState("failed");
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
      setState("loading");
      setHovered(null);
    };
  }, [boundaries.url, filterKey, areasKey, resolvedTheme, router]);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <div
          ref={container}
          role="img"
          aria-label={label}
          data-map-state={state}
          className="h-[480px] w-full overflow-hidden rounded-[12px] border border-stone-hair bg-surface-sunken"
        />
        {state === "loading" || opening ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Spinner
              className="size-6 text-stone-mid"
              aria-label={opening ? "Opening…" : "Loading map…"}
            />
          </div>
        ) : null}
        {state === "failed" ? (
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-[13px] text-stone-deep">
            The map could not be drawn in this browser. The table lists every area&apos;s figures.
          </p>
        ) : null}
      </div>
      <p
        className="min-h-5 text-[13px] text-stone-deep"
        aria-live="polite"
        data-testid="map-readout"
      >
        {hovered ? (
          <>
            <span className="font-medium text-stone-ink">{hovered.name}</span> · {hovered.summary}
            {hovered.href ? <span className="text-stone-mid"> · click to open</span> : null}
          </>
        ) : (
          <span className="text-stone-mid">Point at an area for its figures.</span>
        )}
      </p>
    </div>
  );
}
