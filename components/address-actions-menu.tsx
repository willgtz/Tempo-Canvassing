"use client";

import { useEffect, useRef, useState } from "react";
import { buildAppleMapsUrl, buildGoogleMapsUrl } from "@/lib/geo";

// Clicking the address opens a small menu to hand off to whichever maps
// app the rep actually has, or copy the raw text — same destination-only,
// current-location-as-origin URL shape as the per-stop handoff already
// used on route stops (route-result-panel.tsx), just triggered from a
// click on the address itself instead of a dedicated button.
export function AddressActionsMenu({
  addressLine,
  city,
  state,
  zipcode,
  lat,
  lng,
  className,
  singleLine = false,
}: {
  addressLine: string;
  city?: string | null;
  state?: string | null;
  zipcode?: string | null;
  lat?: number | null;
  lng?: number | null;
  className?: string;
  // Multi-line (address, then city/state/zip on its own line) by default,
  // matching the admin detail panel's existing address block. Some
  // callers (the compact rep-facing header) want it collapsed to one
  // comma-joined line instead.
  singleLine?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fullAddress = [addressLine, city, [state, zipcode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const destination = lat != null && lng != null ? `${lat},${lng}` : fullAddress;

  function handleCopy() {
    navigator.clipboard.writeText(fullAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={
          className ??
          "text-left underline decoration-black/30 underline-offset-2 hover:decoration-black dark:decoration-white/30 dark:hover:decoration-white"
        }
      >
        {singleLine
          ? fullAddress
          : (
            <>
              {addressLine}
              {(city || state || zipcode) && (
                <>
                  <br />
                  {[city, state, zipcode].filter(Boolean).join(", ")}
                </>
              )}
            </>
          )}
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-52 overflow-hidden rounded-xl border border-black/15 bg-white p-1 shadow-lg dark:border-white/20 dark:bg-neutral-900">
          <a
            href={buildAppleMapsUrl(destination)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block rounded px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            Open in Apple Maps
          </a>
          <a
            href={buildGoogleMapsUrl(destination)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block rounded px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            Open in Google Maps
          </a>
          <button
            type="button"
            onClick={handleCopy}
            className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            {copied ? "Copied!" : "Copy Address"}
          </button>
        </div>
      )}
    </div>
  );
}
