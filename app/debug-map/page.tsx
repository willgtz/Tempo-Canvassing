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

export default function DebugMapPage() {
  return (
    <div style={{ height: "100vh", width: "100vw" }}>
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
  );
}
