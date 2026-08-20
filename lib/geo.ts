// Shared browser-geolocation + distance helpers — used both for
// "route from my current location" (leads-explorer.tsx) and door-knock
// location verification (lead-detail-panel.tsx), so the exact same
// getCurrentPosition behavior/timeout/error copy is reused instead of
// diverging between the two call sites.
export function getCurrentLocation(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation isn't supported by this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) =>
        reject(
          new Error(
            err.message || "Couldn't get your location — allow location access and try again."
          )
        ),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

// Haversine, in feet — mirrors the server-side compute_door_knock_verification
// trigger's own formula exactly (schema.sql) so the client-side "too far"
// toast and the server's authoritative verified/distance_ft agree. This is
// only ever used for the immediate, non-blocking UI notice; the DB trigger
// is the real system of record and always recomputes from scratch server-side.
export function distanceFeet(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R_FEET = 20903520; // earth radius in feet
  const toRad = (d: number) => (d * Math.PI) / 180;
  return (
    2 *
    R_FEET *
    Math.asin(
      Math.sqrt(
        Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
          Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2
      )
    )
  );
}
