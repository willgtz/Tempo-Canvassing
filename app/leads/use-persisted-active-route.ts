"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RouteStop } from "./types";

const STORAGE_KEY = "leads-active-route-v1";

export type PersistedActiveRoute = {
  routeId: string | null;
  stops: RouteStop[];
  skippedCount: number;
  visitedLeadIds: string[];
  preserveOrder: boolean;
};

// Per-device persistence for the in-progress route, same pattern as
// usePersistedLeadsFilters — a rep's active route should survive a
// refresh or navigating elsewhere in the app and back, until they
// explicitly end it (handled by the consumer calling save(null)).
export function usePersistedActiveRoute() {
  const [restored, setRestored] = useState<PersistedActiveRoute | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setRestored(JSON.parse(raw));
    } catch {
      // Corrupt or inaccessible storage — just won't restore.
    } finally {
      hydrated.current = true;
    }
  }, []);

  // Memoized so a consumer can safely depend on it in a useEffect without
  // that effect re-firing every render.
  const save = useCallback((next: PersistedActiveRoute | null) => {
    // Don't overwrite saved state with defaults before restore runs.
    if (!hydrated.current) return;
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Quota or private-mode error — route just won't persist.
    }
  }, []);

  return { restored, save };
}
