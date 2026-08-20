"use client";

import { LeadsMap } from "@/app/leads/leads-map";
import type { Disposition, Lead } from "@/app/leads/types";

// Temporary, unauthenticated diagnostic route — renders the exact same
// LeadsMap component the real /leads page uses, with mock data, so it can
// be checked in a headless browser without needing a login session. Not
// linked from anywhere. Delete once the "map not displaying" report is
// resolved.
const MOCK_LEADS: Lead[] = [
  {
    id: "1",
    first_name: "Test",
    last_name: "Lead",
    address_line: "1 Market St",
    city: "San Francisco",
    state: "CA",
    zipcode: "94105",
    lat: 37.7936,
    lng: -122.3965,
    geocode_precision: "rooftop",
    disposition_id: null,
    prior_sale_date: null,
    is_manual: false,
    entered_by: null,
    entered_by_name: null,
    created_at: new Date().toISOString(),
  },
];

const MOCK_DISPOSITIONS: Disposition[] = [];

// Mimics the real ancestor chain (body -> template.tsx -> leads/layout.tsx
// -> LeadsExplorer's own wrapper -> map container) instead of a hardcoded
// 100vh box, since a flex height-cascade bug wouldn't show up in an
// artificially-sized wrapper.
export default function DebugMapPage() {
  return (
    <div className="flex flex-1 flex-col">
      <nav className="hidden flex-wrap items-center justify-between gap-3 border-b border-black/10 px-6 py-3 md:flex dark:border-white/10">
        <span className="font-medium text-sm">Fake Nav</span>
      </nav>
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-black/10 px-3 py-2 md:hidden dark:border-white/10">
          <span className="text-sm">Fake mobile filter row</span>
        </div>
        <div className="flex-1">
          <LeadsMap
            leads={MOCK_LEADS}
            dispositionById={new Map(MOCK_DISPOSITIONS.map((d) => [d.id, d]))}
            apiKey={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? ""}
            selectMode={false}
            selectedLeadIds={[]}
            onSelectLead={() => {}}
            onTogglePin={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
