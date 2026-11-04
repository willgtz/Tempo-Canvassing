"use client";

import { useSyncExternalStore } from "react";

// Matches the iPhone Duo's unfolded inner screen held sideways by its viewport.
// Each clause rules out a different device:
//   pointer: coarse      desktop and laptop browsers, however they're sized
//   orientation          the Duo held upright, which keeps the existing layout
//   min-height: 480px    regular iPhones in landscape (up to ~956 x 440)
//   max-width: 1023px    iPads in landscape (1024px wide and up)
const DUO_VIEWPORT_QUERY =
  "(pointer: coarse) and (orientation: landscape) and (min-width: 800px) and (max-width: 1023px) and (min-height: 480px) and (max-height: 800px)";

// Safari on a real Duo reported the outer screen's size (466 x 678 at 3x) while
// showing the inner screen, and no other iPhone or iPad has those dimensions.
// This catches the Duo if its page reports a viewport outside the query above.
function hasDuoScreenSize(): boolean {
  const short = Math.min(screen.width, screen.height);
  const long = Math.max(screen.width, screen.height);
  return short === 466 && long === 678 && navigator.maxTouchPoints > 0;
}

// The outer screen held sideways is 594 wide, too narrow for these layouts.
const MIN_INNER_SCREEN_WIDTH = 600;

export function isDuoScreen(): boolean {
  if (window.matchMedia(DUO_VIEWPORT_QUERY).matches) return true;
  return (
    hasDuoScreenSize() &&
    window.matchMedia("(orientation: landscape)").matches &&
    window.innerWidth >= MIN_INNER_SCREEN_WIDTH
  );
}

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
  };
}

export function useDuoScreen(): boolean {
  return useSyncExternalStore(subscribe, isDuoScreen, () => false);
}
