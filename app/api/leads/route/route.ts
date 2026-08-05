import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { optimizeRoute } from "@/lib/directions/google";

// Google Directions API's own limit: 25 waypoints total (origin +
// destination + up to 23 intermediate stops) per request. Origin is now
// always the rep's location, so at most 24 of those slots are leads.
const MAX_STOPS = 24;

function isCoords(value: unknown): value is { lat: number; lng: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { lat?: unknown }).lat === "number" &&
    typeof (value as { lng?: unknown }).lng === "number"
  );
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let leadIds: unknown;
  let origin: unknown;
  try {
    ({ leadIds, origin } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isCoords(origin)) {
    return NextResponse.json(
      { error: "Your location is required to build a route." },
      { status: 400 }
    );
  }

  if (!Array.isArray(leadIds) || leadIds.some((id) => typeof id !== "string")) {
    return NextResponse.json({ error: "`leadIds` must be an array of strings" }, { status: 400 });
  }

  if (leadIds.length < 1) {
    return NextResponse.json({ error: "Select at least 1 lead to build a route." }, { status: 400 });
  }

  if (leadIds.length > MAX_STOPS) {
    return NextResponse.json(
      {
        error: `Google's Directions API allows at most ${MAX_STOPS} leads per route (plus your location as the start) — you selected ${leadIds.length}.`,
      },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // leads_select RLS silently excludes any lead the caller can't see —
  // no manual visibility check needed here.
  const { data, error } = await supabase
    .from("leads")
    .select("id, first_name, last_name, address_line, city, state, zipcode, lat, lng")
    .in("id", leadIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byId = new Map((data ?? []).map((l) => [l.id, l]));
  // Preserve the caller's selection order — the last one is the fixed
  // route destination, everything else (including the first) gets
  // reordered nearest-to-farthest between the rep's location and it.
  const ordered = leadIds
    .map((id) => byId.get(id))
    .filter((l): l is NonNullable<typeof l> => Boolean(l));
  const locatable = ordered.filter((l) => l.lat != null && l.lng != null);
  const skippedCount = ordered.length - locatable.length;

  if (locatable.length < 1) {
    return NextResponse.json(
      { error: "At least 1 of the selected leads needs a saved location to build a route." },
      { status: 400 }
    );
  }

  // Single-lead case: nothing to optimize, just origin -> that lead.
  // optimizeRoute handles this fine on its own (empty waypoints list).
  const points = [origin, ...locatable.map((l) => ({ lat: l.lat as number, lng: l.lng as number }))];
  const result = await optimizeRoute(points);

  if (result.status !== "OK") {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const stops = result.order.map((originalIndex, position) => {
    if (originalIndex === 0) {
      return {
        leadId: null,
        name: "Your Location",
        addressLine: null,
        city: null,
        state: null,
        zipcode: null,
        lat: origin.lat,
        lng: origin.lng,
        legFromPrevious: null,
      };
    }
    const lead = locatable[originalIndex - 1];
    return {
      leadId: lead.id,
      name: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Lead",
      addressLine: lead.address_line,
      city: lead.city,
      state: lead.state,
      zipcode: lead.zipcode,
      lat: lead.lat as number,
      lng: lead.lng as number,
      legFromPrevious: position === 0 ? null : (result.legs[position - 1] ?? null),
    };
  });

  return NextResponse.json({ stops, skippedCount });
}
