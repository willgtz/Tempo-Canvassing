"use client";

import { useSlideIn } from "@/lib/use-slide-in";
import { cn } from "@/components/ui/cn";
import type { RouteStop } from "./types";

function buildGoogleMapsUrl(stops: RouteStop[]): string {
  const origin = stops[0];
  const destination = stops[stops.length - 1];
  const waypoints = stops.slice(1, -1);

  const params = new URLSearchParams({
    api: "1",
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    travelmode: "driving",
  });
  if (waypoints.length > 0) {
    params.set("waypoints", waypoints.map((w) => `${w.lat},${w.lng}`).join("|"));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

// Per-stop turn-by-turn handoff — the whole-route link above is for
// starting out, but mid-route a rep needs "get me to just this one
// stop" from wherever they actually are now, not a replay of the whole
// planned route from the original origin. Omitting an origin param on
// both is deliberate — both Apple's and Google's directions URLs
// default to the device's current location when none is given, which is
// exactly the "from wherever I am right now" behavior wanted here.
function buildGoogleMapsStopUrl(stop: RouteStop): string {
  const params = new URLSearchParams({
    api: "1",
    destination: `${stop.lat},${stop.lng}`,
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function buildAppleMapsStopUrl(stop: RouteStop): string {
  const params = new URLSearchParams({
    daddr: `${stop.lat},${stop.lng}`,
    dirflg: "d",
  });
  return `https://maps.apple.com/?${params.toString()}`;
}

export function RouteResultPanel({
  stops,
  skippedCount,
  onClose,
  onSelectLead,
}: {
  stops: RouteStop[];
  skippedCount: number;
  onSelectLead: (leadId: string) => void;
  onClose: () => void;
}) {
  const mapsUrl = buildGoogleMapsUrl(stops);
  const visible = useSlideIn();

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-20 bg-black/30 backdrop-blur-sm transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "fixed right-0 top-0 z-30 h-full w-full max-w-md overflow-y-auto border-l border-black/10 bg-white p-6 shadow-xl transition-transform duration-200 ease-out dark:border-white/10 dark:bg-neutral-950",
          visible ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">Optimized Route</h2>
          <button
            onClick={onClose}
            className="text-sm text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
          >
            Close
          </button>
        </div>

        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Starting from your current location. The last lead you selected is the fixed final
          stop; everything else was reordered nearest-to-farthest by Google.
        </p>

        {skippedCount > 0 && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            {skippedCount} selected lead{skippedCount === 1 ? "" : "s"} skipped — no saved
            location.
          </p>
        )}

        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 block rounded bg-black px-4 py-2 text-center text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Open in Google Maps
        </a>

        <ol className="mt-6 space-y-4">
          {stops.map((stop, i) => (
            <li key={stop.leadId ?? "origin"} className="flex gap-3">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-black text-xs font-medium text-white dark:bg-white dark:text-black">
                {i + 1}
              </span>
              <div className="flex-1 text-sm">
                <div className="flex items-start justify-between gap-2">
                  {/* Tapping the name opens that lead's own detail panel
                      (notes/disposition) — the point being able to leave
                      a note right when arriving at a stop, without
                      leaving the route view to go find the lead again.
                      No leadId means this is the synthetic "current
                      location" origin stop — nothing to open for that. */}
                  {stop.leadId ? (
                    <button
                      type="button"
                      onClick={() => onSelectLead(stop.leadId as string)}
                      className="font-medium underline decoration-black/30 underline-offset-2 hover:decoration-black dark:decoration-white/30 dark:hover:decoration-white"
                    >
                      {stop.name}
                    </button>
                  ) : (
                    <p className="font-medium">{stop.name}</p>
                  )}
                  {stop.leadId && (
                    <div className="flex shrink-0 gap-2 text-xs">
                      <a
                        href={buildAppleMapsStopUrl(stop)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full border border-black/15 px-2 py-0.5 font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                      >
                        Apple Go
                      </a>
                      <a
                        href={buildGoogleMapsStopUrl(stop)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full border border-black/15 px-2 py-0.5 font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                      >
                        Google Go
                      </a>
                    </div>
                  )}
                </div>
                {stop.addressLine && (
                  <p className="text-black/70 dark:text-white/70">
                    {[stop.addressLine, stop.city, stop.state, stop.zipcode]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
                {stop.legFromPrevious && (
                  <p className="text-xs text-black/50 dark:text-white/50">
                    {stop.legFromPrevious.distanceText} · {stop.legFromPrevious.durationText} from
                    previous stop
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
