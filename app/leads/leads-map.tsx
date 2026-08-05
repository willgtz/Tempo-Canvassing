"use client";

import { useMemo } from "react";
import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";
import type { Disposition, Lead } from "./types";

const DEFAULT_COLOR = "#6B7280";
const FALLBACK_CENTER = { lat: 39.8283, lng: -98.5795 }; // center of contiguous US

type LocatedLead = Lead & { lat: number; lng: number };

// Manual (cold-knock) leads get a dashed black ring instead of the plain
// white one, so it's visually obvious on the map why a pin is showing up
// outside a rep's assigned zip.
function pinIcon(color: string, isManual: boolean): string {
  const stroke = isManual ? "#000000" : "#ffffff";
  const dash = isManual ? ' stroke-dasharray="3,2"' : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"><circle cx="13" cy="13" r="9" fill="${color}" stroke="${stroke}" stroke-width="2.5"${dash}/></svg>`;
  return `data:image/svg+xml;utf-8,${encodeURIComponent(svg)}`;
}

// Shown instead of the disposition-colored pin while a lead is selected in
// select mode — the number is its position in selection order, which is
// also what determines route origin (1) / destination (last) later.
function numberedPinIcon(number: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="11" fill="#000000" stroke="#ffffff" stroke-width="2.5"/><text x="14" y="15" text-anchor="middle" dominant-baseline="middle" font-size="12" font-family="sans-serif" fill="#ffffff" font-weight="bold">${number}</text></svg>`;
  return `data:image/svg+xml;utf-8,${encodeURIComponent(svg)}`;
}

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
        defaultCenter={center}
        defaultZoom={locatedLeads.length > 0 ? 11 : 4}
        className="h-[calc(100dvh-160px)] min-h-[480px] w-full"
        gestureHandling="greedy"
      >
        {locatedLeads.map((lead) => {
          const disposition = lead.disposition_id ? dispositionById.get(lead.disposition_id) : undefined;
          const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Lead";
          const selectionIndex = selectMode ? selectedLeadIds.indexOf(lead.id) : -1;
          const isSelected = selectionIndex !== -1;

          return (
            <Marker
              key={lead.id}
              position={{ lat: lead.lat, lng: lead.lng }}
              icon={
                isSelected
                  ? numberedPinIcon(selectionIndex + 1)
                  : pinIcon(disposition?.color ?? DEFAULT_COLOR, lead.is_manual)
              }
              title={lead.is_manual ? `${name} (manually entered)` : name}
              onClick={() => (selectMode ? onTogglePin(lead.id) : onSelectLead(lead.id))}
            />
          );
        })}
      </Map>
    </APIProvider>
  );
}
