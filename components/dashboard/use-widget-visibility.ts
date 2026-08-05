"use client";

import { useEffect, useState } from "react";

// Per-browser preference, not shared data — localStorage is the right
// store here (no server round trip, nothing other users need to see).
export function useWidgetVisibility(storageKey: string) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Reading localStorage on mount to hydrate state from an external
    // store — not derived-state-from-props, which is what this lint rule
    // is meant to catch. localStorage isn't available during SSR, so this
    // can't run any earlier than an effect.
    try {
      const raw = localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setHidden(new Set(JSON.parse(raw)));
    } catch {
      // Malformed or inaccessible storage — fall back to "everything visible".
    }
  }, [storageKey]);

  function toggle(widgetId: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(widgetId)) next.delete(widgetId);
      else next.add(widgetId);
      try {
        localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
      } catch {
        // Quota or private-mode error — visibility just won't persist.
      }
      return next;
    });
  }

  function isVisible(widgetId: string): boolean {
    return !hidden.has(widgetId);
  }

  return { isVisible, toggle };
}
