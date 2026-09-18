"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "leads-explorer-filters-v1";

export type PersistedLeadsFilters = {
  dispositionFilter: string[]; // Set serialized as an array
  zipFilter: string[];
  repFilter: string;
  dateFrom: string;
  dateTo: string;
  updatedFrom: string;
  updatedTo: string;
  appliedAddressQuery: string;
  viewMode: "map" | "list";
};

const DEFAULTS: PersistedLeadsFilters = {
  dispositionFilter: [],
  zipFilter: [],
  repFilter: "all",
  dateFrom: "",
  dateTo: "",
  updatedFrom: "",
  updatedTo: "",
  appliedAddressQuery: "",
  viewMode: "map",
};

// Per-browser preference, not shared data — same localStorage-is-correct
// reasoning as useWidgetVisibility. Restored once on mount; every
// subsequent change is written back immediately via save().
export function usePersistedLeadsFilters() {
  const [restored, setRestored] = useState<PersistedLeadsFilters | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    // Reading localStorage on mount to hydrate state from an external
    // store, not derived-state-from-props — localStorage isn't available
    // during SSR, so this can't run any earlier than an effect. Mirrors
    // useWidgetVisibility's exact same justification.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setRestored({ ...DEFAULTS, ...JSON.parse(raw) });
      else setRestored(DEFAULTS);
    } catch {
      setRestored(DEFAULTS);
    } finally {
      hydrated.current = true;
    }
  }, []);

  // Memoized (stable identity) so a consumer can safely list it in a
  // useEffect's dependency array without that effect re-firing on every
  // render — only when the actual filter values it's called with change.
  const save = useCallback((next: PersistedLeadsFilters) => {
    // Don't overwrite saved state with defaults before restore runs —
    // the consumer's own "write on every change" effect fires on mount
    // too, before restoration has had a chance to hydrate real values.
    if (!hydrated.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Quota or private-mode error — filters just won't persist.
    }
  }, []);

  return { restored, save };
}
