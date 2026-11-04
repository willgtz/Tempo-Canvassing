"use client";

import { useEffect } from "react";
import { useDuoScreen } from "@/lib/use-duo-screen";

// Turns on the html[data-duo-screen] styles in app/globals.css.
export function DuoScreenMarker() {
  const isDuo = useDuoScreen();

  useEffect(() => {
    document.documentElement.toggleAttribute("data-duo-screen", isDuo);
  }, [isDuo]);

  return null;
}
