"use client";

import { useSyncExternalStore } from "react";

// Matches the iPhone Duo's unfolded inner screen held sideways, and nothing
// else this app is used on. Keep in sync with the same query in
// app/globals.css. Each clause rules out a different device:
//   pointer: coarse      desktop and laptop browsers, however they're sized
//   orientation          the Duo held upright, which keeps the existing layout
//   min-height: 480px    regular iPhones in landscape (up to ~956 x 440)
//   max-width: 1023px    iPads in landscape (1024px wide and up)
// The range is wider than the Duo itself because Apple doesn't publish its
// viewport size, and Safari's toolbars reduce the height further.
export const DUO_SCREEN_QUERY =
  "(pointer: coarse) and (orientation: landscape) and (min-width: 800px) and (max-width: 1023px) and (min-height: 480px) and (max-height: 800px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DUO_SCREEN_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useDuoScreen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DUO_SCREEN_QUERY).matches,
    () => false
  );
}
