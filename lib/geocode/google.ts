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

export type ReverseGeocodeOutcome = {
  status: GeocodeStatus;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  formattedAddress?: string;
};

type AddressComponent = { long_name: string; short_name: string; types: string[] };

// Used by the "drop a pin" / "fix pin location" flows (app/leads) — the
// dropped point is the source of truth for the lead's lat/lng either
// way, this is purely to pre-fill the address TEXT fields as a
// convenience. A rep can freely edit those afterward (e.g. a new build
// Google hasn't indexed yet) without it ever moving the pin, since
// nothing here feeds back into lat/lng.
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeOutcome> {
  const key = apiKey();
  if (!key) {
    throw new Error("Server is missing GOOGLE_MAPS_API_KEY");
  }

  const url = new URL(GOOGLE_GEOCODE_URL);
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("key", key);

  const empty = { addressLine: null, city: null, state: null, zipcode: null };

  try {
    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.status === "OK" && data.results?.[0]) {
      const result = data.results[0];
      const components: AddressComponent[] = result.address_components ?? [];
      const find = (type: string, useShort = false) => {
        const c = components.find((c) => c.types.includes(type));
        return c ? (useShort ? c.short_name : c.long_name) : null;
      };

      const streetNumber = find("street_number");
      const route = find("route");
      const addressLine = [streetNumber, route].filter(Boolean).join(" ") || null;
      const city = find("locality") ?? find("sublocality") ?? find("postal_town");
      const state = find("administrative_area_level_1", true);
      const zipcode = find("postal_code");

      return {
        status: "OK",
        addressLine,
        city,
        state,
        zipcode,
        formattedAddress: result.formatted_address,
      };
    }

    if (data.status === "ZERO_RESULTS") {
      return { status: "ZERO_RESULTS", ...empty };
    }

    return { status: "ERROR", ...empty };
  } catch {
    return { status: "ERROR", ...empty };
  }
}
