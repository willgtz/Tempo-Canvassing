import "server-only";

const DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json";

export type DirectionsLeg = { distanceText: string; durationText: string };

export type OptimizeRouteResult =
  | { status: "OK"; order: number[]; legs: DirectionsLeg[] }
  | { status: "ERROR"; error: string };

function apiKey(): string | undefined {
  return process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
}

// points[0] is the route origin, points[points.length - 1] is the
// destination — both fixed by the caller (in this app: first/last pin
// selected). Everything between is reordered by Google's optimizer
// (nearest-to-farthest from origin toward destination), not visited in
// input order. Returns `order`: the full visiting sequence as indices into
// the input `points` array, including origin (always 0) and destination
// (always points.length - 1).
export async function optimizeRoute(
  points: { lat: number; lng: number }[]
): Promise<OptimizeRouteResult> {
  const key = apiKey();
  if (!key) return { status: "ERROR", error: "Server is missing GOOGLE_MAPS_API_KEY" };
  if (points.length < 2) return { status: "ERROR", error: "Need at least 2 points." };

  const origin = points[0];
  const destination = points[points.length - 1];
  const waypoints = points.slice(1, -1);

  const url = new URL(DIRECTIONS_URL);
  url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
  url.searchParams.set("destination", `${destination.lat},${destination.lng}`);
  if (waypoints.length > 0) {
    url.searchParams.set(
      "waypoints",
      "optimize:true|" + waypoints.map((p) => `${p.lat},${p.lng}`).join("|")
    );
  }
  url.searchParams.set("key", key);

  try {
    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.status !== "OK" || !data.routes?.[0]) {
      return {
        status: "ERROR",
        error: `Directions request failed: ${data.status ?? "unknown error"}`,
      };
    }

    const route = data.routes[0];
    const waypointOrder: number[] = route.waypoint_order ?? [];
    // waypoint_order indexes into the `waypoints` slice (points[1..-2]), so
    // offset by 1 to map back into the original `points` array.
    const order = [0, ...waypointOrder.map((i: number) => i + 1), points.length - 1];

    const legs: DirectionsLeg[] = (route.legs ?? []).map(
      (leg: { distance?: { text: string }; duration?: { text: string } }) => ({
        distanceText: leg.distance?.text ?? "",
        durationText: leg.duration?.text ?? "",
      })
    );

    return { status: "OK", order, legs };
  } catch (err) {
    return {
      status: "ERROR",
      error: err instanceof Error ? err.message : "Directions request failed.",
    };
  }
}
