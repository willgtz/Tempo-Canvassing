"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Source, Layer, Marker, type MapRef, type MapMouseEvent } from "react-map-gl/mapbox";
import type { CircleLayerSpecification, SymbolLayerSpecification, GeoJSONSource } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { getCurrentLocation } from "@/lib/geo";
import type { Disposition, Lead } from "./types";

const STREETS_STYLE = "mapbox://styles/mapbox/streets-v12";
const SATELLITE_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";

const DEFAULT_COLOR = "#6B7280";
const FALLBACK_CENTER = { lat: 39.8283, lng: -98.5795 }; // center of contiguous US

type LocatedLead = Lead & { lat: number; lng: number };

// Mapbox's own GeoJSON clustering (GPU-rendered circle/symbol layers) is
// what actually gives the smooth, native-feeling pan/zoom/cluster-expand
// behavior — chosen specifically over hand-rolled clustering (like the
// grid-bucketing approach built for iOS, since MapKit has no native
// clustering either) because Mapbox GL JS does have real clustering
// support, so there's no reason to reimplement it manually here. Falls
// back to plain React <Marker> components only in select mode (route
// building), which needs numbered badges and per-pin click targets that
// a GPU circle layer can't render — select mode never has enough pins on
// screen at once for that to be a performance concern.
const CLUSTER_LAYER: CircleLayerSpecification = {
  id: "clusters",
  type: "circle",
  source: "leads",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": "#2563eb",
    "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26],
    "circle-stroke-width": 2.5,
    "circle-stroke-color": "#ffffff",
  },
};

const CLUSTER_COUNT_LAYER: SymbolLayerSpecification = {
  id: "cluster-count",
  type: "symbol",
  source: "leads",
  filter: ["has", "point_count"],
  layout: {
    "text-field": ["get", "point_count_abbreviated"],
    "text-size": 13,
    "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
  },
  paint: {
    "text-color": "#ffffff",
  },
};

const UNCLUSTERED_LAYER: CircleLayerSpecification = {
  id: "unclustered-point",
  type: "circle",
  source: "leads",
  filter: ["!", ["has", "point_count"]],
  paint: {
    "circle-color": ["get", "color"],
    "circle-radius": 11,
    "circle-stroke-width": 2.5,
    // Manual leads get a dark stroke instead of white — a true dashed
    // stroke isn't supported on Mapbox circle layers (only line layers),
    // so this is the closest equivalent distinguisher within a GPU
    // circle layer's actual capabilities.
    "circle-stroke-color": ["case", ["get", "isManual"], "#000000", "#ffffff"],
  },
};

// Same filter as UNCLUSTERED_LAYER (only individual, not-yet-clustered
// pins), so labels only ever show once zoomed in enough that a pin
// represents exactly one lead — never on a cluster bubble, where a
// single disposition name wouldn't mean anything. White halo (not a
// dark-mode variant) since this renders on the map's own tile imagery,
// not the page's CSS — needs to stay legible against whatever's under it
// regardless of the site's light/dark theme.
const UNCLUSTERED_LABEL_LAYER: SymbolLayerSpecification = {
  id: "unclustered-label",
  type: "symbol",
  source: "leads",
  filter: ["!", ["has", "point_count"]],
  layout: {
    "text-field": ["get", "dispositionName"],
    "text-size": 11,
    "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
    "text-offset": [0, 1.3],
    "text-anchor": "top",
    "text-max-width": 8,
  },
  paint: {
    "text-color": "#1f2937",
    "text-halo-color": "#ffffff",
    "text-halo-width": 1.4,
  },
};

export function LeadsMap({
  leads,
  dispositionById,
  apiKey,
  selectMode,
  selectedLeadIds,
  onSelectLead,
  onTogglePin,
}: {
  leads: Lead[];
  dispositionById: Map<string, Disposition>;
  apiKey: string;
  selectMode: boolean;
  selectedLeadIds: string[];
  onSelectLead: (leadId: string) => void;
  onTogglePin: (leadId: string) => void;
}) {
  const mapRef = useRef<MapRef>(null);
  // Mapbox failures (bad token, network/adblock-blocked tile requests,
  // WebGL context loss) otherwise fail silently into a blank canvas with
  // nothing in the UI explaining why — this surfaces whatever Mapbox
  // itself reports instead of leaving that a total mystery next time.
  const [mapError, setMapError] = useState<string | null>(null);
  // Every page mounts inside template.tsx's page-fade-in wrapper (a CSS
  // opacity keyframe animation on the page's outer container, added this
  // session). Safari has a known bug where a WebGL canvas created while
  // an ancestor's opacity is still animating can composite as
  // permanently blank afterward — no JS/network error, since it's a
  // paint bug, not something Mapbox's own error events would ever see.
  // Delaying Map creation until just after that 0.18s animation finishes
  // sidesteps it entirely.
  const [readyToMount, setReadyToMount] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReadyToMount(true), 220);
    return () => clearTimeout(t);
  }, []);

  // Backstop for any other way the map can end up permanently blank with
  // no error (stuck WebGL context, a swallowed failure, whatever the
  // fade-in isn't) — if 'load' hasn't fired a few seconds after mounting,
  // offer a retry that fully remounts the Map via a fresh key, rather
  // than leaving a dead end with no way to recover short of reloading
  // the whole page.
  const [loaded, setLoaded] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [remountKey, setRemountKey] = useState(0);
  const [satellite, setSatellite] = useState(false);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  useEffect(() => {
    if (!readyToMount || loaded) return;
    const t = setTimeout(() => setStuck(true), 6000);
    return () => clearTimeout(t);
  }, [readyToMount, loaded, remountKey]);

  const locatedLeads = useMemo(
    () => leads.filter((l): l is LocatedLead => l.lat != null && l.lng != null),
    [leads]
  );

  const center = useMemo(() => {
    if (locatedLeads.length === 0) return FALLBACK_CENTER;
    const sum = locatedLeads.reduce(
      (acc, l) => ({ lat: acc.lat + l.lat, lng: acc.lng + l.lng }),
      { lat: 0, lng: 0 }
    );
    return { lat: sum.lat / locatedLeads.length, lng: sum.lng / locatedLeads.length };
  }, [locatedLeads]);

  const geojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: locatedLeads.map((lead) => {
        const disposition = lead.disposition_id ? dispositionById.get(lead.disposition_id) : undefined;
        return {
          type: "Feature" as const,
          properties: {
            leadId: lead.id,
            color: disposition?.color ?? DEFAULT_COLOR,
            isManual: lead.is_manual,
            dispositionName: disposition?.name ?? "No Status",
          },
          geometry: { type: "Point" as const, coordinates: [lead.lng, lead.lat] },
        };
      }),
    }),
    [locatedLeads, dispositionById]
  );

  const handleClick = useCallback(
    (e: MapMouseEvent) => {
      // mapbox-gl's own GeoJSONFeature type and the ambient GeoJSON.Feature
      // type it extends don't resolve cleanly together here (a known
      // friction point with this library's types) — casting to a minimal
      // local shape for exactly what's read below sidesteps that instead
      // of fighting the upstream type conflict.
      const feature = e.features?.[0] as
        | {
            properties: Record<string, unknown> | null;
            geometry: { type: string; coordinates: [number, number] };
          }
        | undefined;
      if (!feature) return;
      const map = mapRef.current?.getMap();
      if (!map) return;

      if (feature.properties?.cluster) {
        const source = map.getSource("leads") as GeoJSONSource | undefined;
        const clusterId = feature.properties.cluster_id as number;
        source?.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err || feature.geometry.type !== "Point") return;
          map.easeTo({
            center: feature.geometry.coordinates,
            zoom: zoom ?? map.getZoom() + 2,
            duration: 400,
          });
        });
        return;
      }

      const leadId = feature.properties?.leadId as string | undefined;
      if (!leadId) return;
      if (selectMode) onTogglePin(leadId);
      else onSelectLead(leadId);
    },
    [selectMode, onSelectLead, onTogglePin]
  );

  if (!apiKey) {
    return (
      <div className="flex h-full min-h-[480px] items-center justify-center p-6 text-sm text-black/60 dark:text-white/60">
        Map unavailable — NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN isn&apos;t set.
      </div>
    );
  }

  if (!readyToMount) {
    return <div className="h-full w-full animate-pulse bg-black/5 dark:bg-white/5" />;
  }

  function retryMap() {
    setMapError(null);
    setLoaded(false);
    setStuck(false);
    setRemountKey((k) => k + 1);
  }

  // Matches the iOS app's "center on me" map control — flies to the
  // rep's current position and drops a marker there, same as MapKit's
  // built-in blue-dot user location, since Mapbox GL doesn't have a
  // built-in equivalent of its own to just turn on.
  async function handleLocateMe() {
    setLocating(true);
    try {
      const loc = await getCurrentLocation();
      setMyLocation(loc);
      mapRef.current?.getMap().flyTo({ center: [loc.lng, loc.lat], zoom: 15, duration: 800 });
    } catch (err) {
      setMapError(err instanceof Error ? err.message : "Couldn't get your location.");
    } finally {
      setLocating(false);
    }
  }

  return (
    // absolute + inset-0 (not h-full/w-full) — the parent (leads-explorer's
    // "relative flex-1" div) has a real flex-computed height, but a plain
    // block child's height:100% doesn't reliably resolve against that (see
    // the note at that call site). Absolute positioning sizes directly off
    // the containing block's actual box, sidestepping the issue — this is
    // what was silently collapsing the whole map to 0 height.
    <div className="absolute inset-0">
      {mapError && (
        <div className="absolute inset-x-0 top-0 z-10 bg-red-600 px-3 py-1.5 text-center text-xs font-medium text-white">
          Map error: {mapError}
        </div>
      )}
      {stuck && !loaded && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/95 p-6 text-center dark:bg-neutral-950/95">
          <p className="text-sm text-black/70 dark:text-white/70">
            Map didn&apos;t finish loading{mapError ? "" : " — no error was reported"}.
          </p>
          <Button type="button" size="sm" onClick={retryMap}>
            Retry
          </Button>
        </div>
      )}
      {/* 'load' firing doesn't guarantee the canvas actually painted
          anything visible — confirmed in testing that a WebGL canvas can
          fire 'load' while rendering nothing, so the stuck-timeout above
          can't catch every blank-map case. This is an always-available
          manual escape hatch for exactly that: a fully loaded-but-blank
          map with nothing else prompting a retry. */}
      <div className="absolute right-2 top-2 z-10 flex flex-col gap-2">
        <button
          onClick={retryMap}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-white/90 text-black/60 shadow active:bg-black/10 dark:border-white/10 dark:bg-neutral-950/90 dark:text-white/60 dark:active:bg-white/20"
          aria-label="Reload map"
          title="Reload map"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
        </button>
        <button
          onClick={() => setSatellite((s) => !s)}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full border shadow",
            satellite
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-black/10 bg-white/90 text-black/60 active:bg-black/10 dark:border-white/10 dark:bg-neutral-950/90 dark:text-white/60 dark:active:bg-white/20"
          )}
          aria-label={satellite ? "Switch to streets view" : "Switch to satellite view"}
          title={satellite ? "Streets view" : "Satellite view"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="m12 2 9 4.5-9 4.5-9-4.5Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="m3 11.5 9 4.5 9-4.5M3 16.5l9 4.5 9-4.5" />
          </svg>
        </button>
        <button
          onClick={handleLocateMe}
          disabled={locating}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-white/90 text-black/60 shadow active:bg-black/10 disabled:opacity-50 dark:border-white/10 dark:bg-neutral-950/90 dark:text-white/60 dark:active:bg-white/20"
          aria-label="Center on my location"
          title="Center on my location"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={cn("h-4 w-4", locating && "animate-pulse")}>
            <circle cx="12" cy="12" r="3" />
            <path strokeLinecap="round" d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
        </button>
      </div>
      <Map
      key={remountKey}
      ref={mapRef}
      mapboxAccessToken={apiKey}
      initialViewState={{
        longitude: center.lng,
        latitude: center.lat,
        zoom: locatedLeads.length > 0 ? 11 : 3.5,
      }}
      mapStyle={satellite ? SATELLITE_STYLE : STREETS_STYLE}
      style={{ width: "100%", height: "100%" }}
      // Bottom padding keeps pins/controls from being hidden under the
      // fixed mobile tab bar (~4rem + safe-area) without shrinking the
      // map's actual rendered area — the map still bleeds full-bleed
      // behind the bar, this just tells Mapbox to treat that strip as
      // obscured for centering/control-placement purposes. Harmless on
      // desktop too, where there's no tab bar to worry about.
      padding={{ top: 0, bottom: 80, left: 0, right: 0 }}
      onLoad={() => setLoaded(true)}
      interactiveLayerIds={selectMode ? [] : ["clusters", "unclustered-point"]}
      onClick={selectMode ? undefined : handleClick}
      onError={(e) => {
        console.error("Mapbox error:", e.error);
        setMapError(e.error?.message ?? "unknown error — check console");
      }}
    >
      {!selectMode && (
        <Source
          id="leads"
          type="geojson"
          data={geojson}
          cluster={true}
          clusterMaxZoom={14}
          clusterRadius={50}
        >
          <Layer {...CLUSTER_LAYER} />
          <Layer {...CLUSTER_COUNT_LAYER} />
          <Layer {...UNCLUSTERED_LAYER} />
          <Layer {...UNCLUSTERED_LABEL_LAYER} />
        </Source>
      )}

      {/* Same blue-dot treatment as MapKit's built-in user location —
          Mapbox GL has no built-in equivalent, so this is a plain marker
          instead, dropped/updated only when "center on me" is tapped
          (no continuous location watching, to avoid burning battery for
          a marker most reps won't look at twice). */}
      {myLocation && (
        <Marker longitude={myLocation.lng} latitude={myLocation.lat}>
          <div className="h-4 w-4 rounded-full border-2 border-white bg-blue-600 shadow-[0_0_0_4px_rgba(37,99,235,0.3)]" />
        </Marker>
      )}

      {/* Select mode (route building) skips clustering entirely — picking
          leads for a route needs a real per-pin click target and numbered
          badges showing selection order, neither of which a GPU circle
          layer can render. Never enough pins on screen during active
          selection for plain DOM markers to be a performance problem. */}
      {selectMode &&
        locatedLeads.map((lead) => {
          const selectionIndex = selectedLeadIds.indexOf(lead.id);
          const isSelected = selectionIndex !== -1;
          const disposition = lead.disposition_id ? dispositionById.get(lead.disposition_id) : undefined;
          return (
            <Marker
              key={lead.id}
              longitude={lead.lng}
              latitude={lead.lat}
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onTogglePin(lead.id);
              }}
            >
              {isSelected ? (
                <div className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-black text-xs font-bold text-white shadow">
                  {selectionIndex + 1}
                </div>
              ) : (
                <div
                  className="h-[22px] w-[22px] cursor-pointer rounded-full shadow"
                  style={{
                    backgroundColor: disposition?.color ?? DEFAULT_COLOR,
                    border: lead.is_manual ? "2.5px dashed #000000" : "2.5px solid #ffffff",
                  }}
                />
              )}
            </Marker>
          );
        })}
      </Map>
    </div>
  );
}
