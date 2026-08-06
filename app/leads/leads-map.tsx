"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdvancedMarker, APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import type { Marker as ClustererMarker } from "@googlemaps/markerclusterer";
import type { Disposition, Lead } from "./types";

const DEFAULT_COLOR = "#6B7280";
const FALLBACK_CENTER = { lat: 39.8283, lng: -98.5795 }; // center of contiguous US

type LocatedLead = Lead & { lat: number; lng: number };

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

  if (!apiKey) {
    return (
      <div className="flex h-full min-h-[480px] items-center justify-center p-6 text-sm text-black/60 dark:text-white/60">
        Map unavailable — NEXT_PUBLIC_GOOGLE_MAPS_API_KEY isn&apos;t set.
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey}>
      <Map
        // Advanced Markers (needed for clustering) require a real Map ID
        // resource, separate from the API key — "DEMO_MAP_ID" is Google's
        // own documented placeholder that works out of the box for this,
        // but isn't meant to be relied on long-term. Set
        // NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID (Google Cloud Console -> Maps
        // Platform -> Map Management -> create one, free) to use a real
        // one instead — no code change needed once that's set.
        mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID"}
        defaultCenter={center}
        defaultZoom={locatedLeads.length > 0 ? 11 : 4}
        className="h-[calc(100dvh-160px)] min-h-[480px] w-full"
        gestureHandling="greedy"
      >
        <LeadMarkers
          leads={locatedLeads}
          dispositionById={dispositionById}
          selectMode={selectMode}
          selectedLeadIds={selectedLeadIds}
          onSelectLead={onSelectLead}
          onTogglePin={onTogglePin}
        />
      </Map>
    </APIProvider>
  );
}

// Clustering (@googlemaps/markerclusterer) needs real
// google.maps.marker.AdvancedMarkerElement instances, which the
// declarative <AdvancedMarker> JSX component hands back via a ref
// callback — this is the standard vis.gl pattern for wiring the two
// together (their own official clustering example uses the same
// collect-refs-into-a-map-then-feed-a-clusterer approach). Disabled
// entirely in select mode, same reasoning as iOS: picking leads for a
// route depends on tapping individual pins, and clustering them away at
// low zoom would make that workflow confusing/impossible.
function LeadMarkers({
  leads,
  dispositionById,
  selectMode,
  selectedLeadIds,
  onSelectLead,
  onTogglePin,
}: {
  leads: LocatedLead[];
  dispositionById: Map<string, Disposition>;
  selectMode: boolean;
  selectedLeadIds: string[];
  onSelectLead: (leadId: string) => void;
  onTogglePin: (leadId: string) => void;
}) {
  const map = useMap();
  const clusterer = useRef<MarkerClusterer | null>(null);
  const [markerRefs, setMarkerRefs] = useState<Record<string, google.maps.marker.AdvancedMarkerElement>>({});

  useEffect(() => {
    if (!map) return;
    if (!clusterer.current) {
      clusterer.current = new MarkerClusterer({ map });
    }
  }, [map]);

  useEffect(() => {
    if (!clusterer.current) return;
    clusterer.current.clearMarkers();
    if (!selectMode) {
      clusterer.current.addMarkers(Object.values(markerRefs) as ClustererMarker[]);
    }
  }, [markerRefs, selectMode]);

  // Stable across re-renders (empty dep array — the updater form of
  // setMarkerRefs never needs markerRefs itself as a closure value) so
  // LeadMarker below can depend on it in its own useCallback without that
  // callback's identity changing every render.
  const setMarkerRef = useCallback((marker: google.maps.marker.AdvancedMarkerElement | null, leadId: string) => {
    setMarkerRefs((prev) => {
      if (marker && prev[leadId] === marker) return prev;
      if (!marker && !prev[leadId]) return prev;
      const next = { ...prev };
      if (marker) next[leadId] = marker;
      else delete next[leadId];
      return next;
    });
  }, []);

  return (
    <>
      {leads.map((lead) => {
        const disposition = lead.disposition_id ? dispositionById.get(lead.disposition_id) : undefined;
        const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Lead";
        const selectionIndex = selectMode ? selectedLeadIds.indexOf(lead.id) : -1;
        const isSelected = selectionIndex !== -1;

        return (
          <LeadMarker
            key={lead.id}
            lead={lead}
            title={lead.is_manual ? `${name} (manually entered)` : name}
            color={disposition?.color ?? DEFAULT_COLOR}
            isSelected={isSelected}
            selectionIndex={selectionIndex}
            onRef={setMarkerRef}
            onClick={() => (selectMode ? onTogglePin(lead.id) : onSelectLead(lead.id))}
          />
        );
      })}
    </>
  );
}

// Split out specifically so its ref callback can be memoized per-marker
// via useCallback (stable as long as onRef/lead.id don't change, which
// they don't across re-renders of the same list item). Passing an inline
// `ref={(marker) => ...}` arrow straight on <AdvancedMarker> — a new
// function every render — made React detach and reattach the ref on
// every single render (old identity -> null, new identity -> marker
// again), which fed setMarkerRefs in a loop and threw React error #185
// (max update depth exceeded).
function LeadMarker({
  lead,
  title,
  color,
  isSelected,
  selectionIndex,
  onRef,
  onClick,
}: {
  lead: LocatedLead;
  title: string;
  color: string;
  isSelected: boolean;
  selectionIndex: number;
  onRef: (marker: google.maps.marker.AdvancedMarkerElement | null, leadId: string) => void;
  onClick: () => void;
}) {
  const ref = useCallback(
    (marker: google.maps.marker.AdvancedMarkerElement | null) => onRef(marker, lead.id),
    [onRef, lead.id]
  );

  return (
    <AdvancedMarker
      ref={ref}
      position={{ lat: lead.lat, lng: lead.lng }}
      title={title}
      onClick={onClick}
    >
      {isSelected ? (
        <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-black text-xs font-bold text-white shadow">
          {selectionIndex + 1}
        </div>
      ) : (
        <div
          className="h-[26px] w-[26px] rounded-full shadow"
          style={{
            backgroundColor: color,
            border: lead.is_manual ? "2.5px dashed #000000" : "2.5px solid #ffffff",
          }}
        />
      )}
    </AdvancedMarker>
  );
}
