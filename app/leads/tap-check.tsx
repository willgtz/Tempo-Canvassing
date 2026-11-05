"use client";

import { useEffect, useState, type RefObject } from "react";
import type { MapRef } from "react-map-gl/mapbox";

// TEMPORARY: diagnoses missed pin taps on real phones. Remove once the cause is
// found. Shows only with ?tapcheck=1 in the address.

type TapRecord = { clickFired: boolean; result: string };

let currentTap: TapRecord | null = null;

export function reportTapResult(result: string) {
  if (currentTap) currentTap.result = result;
}

const FINALIZE_DELAY_MS = 450;
const NEAREST_PIN_SEARCH_PX = 60;
const MAX_LINES = 7;

export function TapCheckReadout({ mapRef, mapLoaded }: { mapRef: RefObject<MapRef | null>; mapLoaded: boolean }) {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!mapLoaded || !window.location.search.includes("tapcheck=1")) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const container = map.getCanvasContainer();

    let count = 0;
    let start: { x: number; y: number; at: number; moved: number; fingers: number; wasMoving: boolean; lngLat: [number, number] } | null = null;

    const toMapPoint = (touch: Touch) => {
      const rect = container.getBoundingClientRect();
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    };

    function nearestPin(point: { x: number; y: number }): string {
      const features = map!.queryRenderedFeatures(
        [
          [point.x - NEAREST_PIN_SEARCH_PX, point.y - NEAREST_PIN_SEARCH_PX],
          [point.x + NEAREST_PIN_SEARCH_PX, point.y + NEAREST_PIN_SEARCH_PX],
        ],
        { layers: ["clusters", "unclustered-point"] }
      );
      let nearest = Infinity;
      for (const feature of features) {
        const { geometry } = feature as unknown as { geometry: { coordinates: [number, number] } };
        const projected = map!.project(geometry.coordinates);
        nearest = Math.min(nearest, Math.hypot(projected.x - point.x, projected.y - point.y));
      }
      return nearest === Infinity ? "none near" : `${Math.round(nearest)}pt away`;
    }

    function onTouchStart(e: TouchEvent) {
      if (start) {
        start.fingers = Math.max(start.fingers, e.touches.length);
        return;
      }
      const point = toMapPoint(e.touches[0]);
      const lngLat = map!.unproject([point.x, point.y]);
      start = { ...point, at: performance.now(), moved: 0, fingers: e.touches.length, wasMoving: map!.isMoving(), lngLat: [lngLat.lng, lngLat.lat] };
      currentTap = { clickFired: false, result: "none" };
    }

    function onTouchMove(e: TouchEvent) {
      if (!start) return;
      const point = toMapPoint(e.touches[0]);
      start.moved = Math.max(start.moved, Math.hypot(point.x - start.x, point.y - start.y));
      start.fingers = Math.max(start.fingers, e.touches.length);
    }

    function onTouchEnd(e: TouchEvent) {
      if (!start || e.touches.length > 0) return;
      const tap = start;
      const record = currentTap;
      start = null;
      const end = toMapPoint(e.changedTouches[0]);
      const heldMs = Math.round(performance.now() - tap.at);
      const pinNote = nearestPin(end);
      window.setTimeout(() => {
        count += 1;
        const shifted = map!.project(tap.lngLat);
        const mapShift = Math.round(Math.hypot(shifted.x - tap.x, shifted.y - tap.y));
        const pageZoom = window.visualViewport?.scale ?? 1;
        const parts = [
          `#${count}`,
          `finger ${Math.round(tap.moved)}pt`,
          `${heldMs}ms`,
          record?.clickFired || record?.result !== "none" ? "TAP COUNTED" : "TAP NOT COUNTED",
          `found: ${record?.result ?? "none"}`,
          `pin ${pinNote}`,
          `map moved ${mapShift}pt`,
          `zoom ${map!.getZoom().toFixed(1)}`,
        ];
        if (tap.wasMoving) parts.push("map was moving");
        if (tap.fingers > 1) parts.push(`${tap.fingers} fingers`);
        if (Math.abs(pageZoom - 1) > 0.01) parts.push(`page zoom ${pageZoom.toFixed(2)}`);
        setLines((prev) => [...prev.slice(-(MAX_LINES - 1)), parts.join(" · ")]);
      }, FINALIZE_DELAY_MS);
    }

    function onClick() {
      if (currentTap) currentTap.clickFired = true;
    }

    container.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    container.addEventListener("touchmove", onTouchMove, { capture: true, passive: true });
    container.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
    container.addEventListener("touchcancel", onTouchEnd, { capture: true, passive: true });
    container.addEventListener("click", onClick, { capture: true });
    return () => {
      container.removeEventListener("touchstart", onTouchStart, { capture: true });
      container.removeEventListener("touchmove", onTouchMove, { capture: true });
      container.removeEventListener("touchend", onTouchEnd, { capture: true });
      container.removeEventListener("touchcancel", onTouchEnd, { capture: true });
      container.removeEventListener("click", onClick, { capture: true });
    };
  }, [mapRef, mapLoaded]);

  if (lines.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-x-2 bottom-8 z-20 rounded bg-black/85 p-2 font-mono text-[11px] leading-snug text-white">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}
