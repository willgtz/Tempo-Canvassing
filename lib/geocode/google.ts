import "server-only";

const GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

export type GeocodeStatus = "OK" | "ZERO_RESULTS" | "ERROR";

// Google's own precision signal for the result. ROOFTOP means the point
// came from an actual building location; RANGE_INTERPOLATED/
// GEOMETRIC_CENTER/APPROXIMATE mean the pin is estimated and may not be on
// the correct house — worth surfacing for a door-knocking app.
export type GeocodePrecision =
  | "ROOFTOP"
  | "RANGE_INTERPOLATED"
  | "GEOMETRIC_CENTER"
  | "APPROXIMATE";

export type GeocodeOutcome = {
  status: GeocodeStatus;
  lat: number | null;
  lng: number | null;
  precision: GeocodePrecision | null;
  formattedAddress?: string;
};

function apiKey(): string | undefined {
  return process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
}

export async function geocodeAddress(address: string): Promise<GeocodeOutcome> {
  const key = apiKey();
  if (!key) {
    throw new Error("Server is missing GOOGLE_MAPS_API_KEY");
  }

  const url = new URL(GOOGLE_GEOCODE_URL);
  url.searchParams.set("address", address);
  url.searchParams.set("key", key);

  try {
    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.status === "OK" && data.results?.[0]) {
      const { lat, lng } = data.results[0].geometry.location;
      const precision: GeocodePrecision = data.results[0].geometry.location_type;
      return {
        status: "OK",
        lat,
        lng,
        precision,
        formattedAddress: data.results[0].formatted_address,
      };
    }

    if (data.status === "ZERO_RESULTS") {
      return { status: "ZERO_RESULTS", lat: null, lng: null, precision: null };
    }

    // OVER_QUERY_LIMIT, REQUEST_DENIED, INVALID_REQUEST, UNKNOWN_ERROR, etc.
    // — treated as a soft per-row failure, not a thrown error.
    return { status: "ERROR", lat: null, lng: null, precision: null };
  } catch {
    return { status: "ERROR", lat: null, lng: null, precision: null };
  }
}
