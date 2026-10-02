import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { reverseGeocode } from "@/lib/geocode/google";

// Unlike /api/geocode (forward, admin-only — used by the bulk upload
// tooling), this is used by the drop-a-pin / fix-pin-location flows on
// the rep-facing leads map, so it's gated to any active session, not
// just admin.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let lat: unknown;
  let lng: unknown;
  try {
    ({ lat, lng } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "`lat` and `lng` (numbers) are required" }, { status: 400 });
  }

  try {
    const result = await reverseGeocode(lat, lng);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reverse geocoding failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
