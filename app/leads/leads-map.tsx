"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Map, { Source, Layer, Marker, type MapRef, type MapMouseEvent } from "react-map-gl/mapbox";
import type { CircleLayerSpecification, SymbolLayerSpecification, GeoJSONSource } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Disposition, Lead } from "./types";

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

  return (
    <div className="relative h-full w-full">
      {mapError && (
        <div className="absolute inset-x-0 top-0 z-10 bg-red-600 px-3 py-1.5 text-center text-xs font-medium text-white">
          Map error: {mapError}
        </div>
      )}
      <Map
      ref={mapRef}
      mapboxAccessToken={apiKey}
      initialViewState={{
        longitude: center.lng,
        latitude: center.lat,
        zoom: locatedLeads.length > 0 ? 11 : 3.5,
      }}
      mapStyle="mapbox://styles/mapbox/streets-v12"
      style={{ width: "100%", height: "100%" }}
      // Bottom padding keeps pins/controls from being hidden under the
      // fixed mobile tab bar (~4rem + safe-area) without shrinking the
      // map's actual rendered area — the map still bleeds full-bleed
      // behind the bar, this just tells Mapbox to treat that strip as
      // obscured for centering/control-placement purposes. Harmless on
      // desktop too, where there's no tab bar to worry about.
      padding={{ top: 0, bottom: 80, left: 0, right: 0 }}
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
        </Source>
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
