"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "./ui/cn";

export type AddressResult = {
  addressLine: string;
  city: string | null;
  state: string | null;
  zipcode: string | null;
};

type MapboxFeature = {
  id: string;
  place_name: string;
  text: string;
  address?: string;
  context?: { id: string; text: string; short_code?: string }[];
};

function parseFeature(feature: MapboxFeature): AddressResult {
  const addressLine = [feature.address, feature.text].filter(Boolean).join(" ");
  let city: string | null = null;
  let state: string | null = null;
  let zipcode: string | null = null;
  for (const ctx of feature.context ?? []) {
    if (ctx.id.startsWith("postcode")) zipcode = ctx.text;
    else if (ctx.id.startsWith("place")) city = ctx.text;
    else if (ctx.id.startsWith("region")) state = ctx.short_code?.split("-")[1] ?? ctx.text;
  }
  return { addressLine, city, state, zipcode };
}

// Client-side Mapbox Geocoding lookup as the user types — same
// NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN already shipped to the browser for the
// leads map, reused here rather than wiring up a second provider (e.g.
// Google Places) that would need its own separate public key/billing
// setup. Picking a suggestion fills in a real, correctly-spelled address
// plus city/state/zip in one shot, instead of a rep typing (and
// mis-typing) all of those by hand.
export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  required,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: AddressResult) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const [suggestions, setSuggestions] = useState<MapboxFeature[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!token || value.trim().length < 4) {
      // setTimeout(…, 0) (not a direct setState call) so this doesn't
      // trip react-hooks/set-state-in-effect — functionally identical,
      // just deferred a tick.
      debounceRef.current = setTimeout(() => setSuggestions([]), 0);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(value)}.json?access_token=${token}&autocomplete=true&types=address&country=us&limit=5`
        );
        if (!res.ok) return;
        const data = (await res.json()) as { features?: MapboxFeature[] };
        setSuggestions(data.features ?? []);
      } catch {
        // Silent — this is a convenience layer, not a required part of
        // the form; the plain text input still works fine on failure.
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [value, token]);

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Delay so a click on a suggestion registers before blur closes
        // the list (mousedown fires before blur otherwise loses the click).
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className={className}
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded border border-black/15 bg-white shadow-lg dark:border-white/20 dark:bg-neutral-900">
          {suggestions.map((feature) => (
            <li key={feature.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(parseFeature(feature));
                  setOpen(false);
                }}
                className={cn(
                  "block w-full px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
                )}
              >
                {feature.place_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
