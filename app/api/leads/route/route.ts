import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { optimizeRoute } from "@/lib/directions/google";
import type { RouteStop } from "@/app/leads/types";

// Overall selection cap a rep can build a route from in one go.
const MAX_STOPS = 100;

// Google Directions API's own hard limit: 25 waypoints total (origin +
// destination + up to 23 intermediate stops) per REQUEST — unrelated to
// MAX_STOPS above. To support more than 24 leads, the full lead list is
// split into chunks of this size and run through sequential Directions
// calls below, with each chunk's final stop feeding the next chunk's
// origin so the whole thing reads as one continuous route.
const CHUNK_SIZE = 24;

type LeadRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  address_line: string;
  city: string | null;
  state: string | null;
  zipcode: string;
  lat: number;
  lng: number;
};

function originStop(point: { lat: number; lng: number }): RouteStop {
  return {
    leadId: null,
    name: "Your Location",
    addressLine: null,
    city: null,
    state: null,
    zipcode: null,
    lat: point.lat,
    lng: point.lng,
    legFromPrevious: null,
  };
}

function leadStop(lead: LeadRow, legFromPrevious: RouteStop["legFromPrevious"]): RouteStop {
  return {
    leadId: lead.id,
    name: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Lead",
    addressLine: lead.address_line,
    city: lead.city,
    state: lead.state,
    zipcode: lead.zipcode,
    lat: lead.lat,
    lng: lead.lng,
    legFromPrevious,
  };
}

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
  let preserveOrder: unknown;
  try {
    ({ leadIds, origin, preserveOrder } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  // "Reuse this route" replay — recompute fresh distances/times without
  // letting Google reorder the stops. Defaults to normal optimize-on
  // behavior for every other caller.
  const preserveStopOrder = preserveOrder === true;

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

  // Split into <=CHUNK_SIZE-lead groups, each run through its own
  // Directions call (origin + up to 23 waypoints + 1 destination = 25
  // points, the API's hard per-request cap). Each chunk's own last stop
  // becomes the next chunk's origin, so the result reads as one
  // continuous route rather than N independent ones. Single-lead/
  // single-chunk routes fall out of this as the len-1 case — no separate
  // code path needed.
  const chunks: LeadRow[][] = [];
  for (let i = 0; i < locatable.length; i += CHUNK_SIZE) {
    chunks.push(locatable.slice(i, i + CHUNK_SIZE) as LeadRow[]);
  }

  const stops: RouteStop[] = [];
  let chunkOrigin = origin;
  for (let i = 0; i < chunks.length; i++) {
    const chunkLeads = chunks[i];
    const points = [chunkOrigin, ...chunkLeads.map((l) => ({ lat: l.lat, lng: l.lng }))];
    const result = await optimizeRoute(points, { optimize: !preserveStopOrder });

    if (result.status !== "OK") {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    const chunkStops = result.order.map((originalIndex, position) => {
      if (originalIndex === 0) return originStop(chunkOrigin);
      return leadStop(chunkLeads[originalIndex - 1], position === 0 ? null : (result.legs[position - 1] ?? null));
    });

    // Chunk 0's local origin is the rep's real location — kept as the
    // route's own first stop. Every later chunk's local origin is really
    // just the previous chunk's final stop (passed in as `chunkOrigin`
    // below), already emitted at the end of the prior iteration, so it's
    // dropped here to avoid appearing twice.
    stops.push(...(i === 0 ? chunkStops : chunkStops.slice(1)));

    const lastStop = stops[stops.length - 1];
    chunkOrigin = { lat: lastStop.lat, lng: lastStop.lng };
  }

  // Logged for Route History (routes table, schema.sql — already existed
  // unused: nothing ever wrote to it before this). Best-effort: a failure
  // here shouldn't fail the route the rep is actually waiting on. Also
  // selects the new row's id back — needed so the client can toggle
  // visited_lead_ids against this specific route (previously discarded
  // entirely, so there was no way to reference this row after creation).
  const orderedLeadIds = stops.map((s) => s.leadId).filter((id): id is string => id !== null);
  const { data: routeRow, error: historyError } = await supabase
    .from("routes")
    .insert({
      user_id: session.userId,
      lead_ids: leadIds,
      ordered_lead_ids: orderedLeadIds,
    })
    .select("id")
    .single();
  if (historyError) {
    console.error("Failed to save route history:", historyError.message);
  }

  return NextResponse.json({ stops, skippedCount, routeId: routeRow?.id ?? null });
}
