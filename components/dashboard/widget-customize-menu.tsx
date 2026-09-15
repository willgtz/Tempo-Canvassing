"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export type WidgetOption = { id: string; label: string };

export function WidgetCustomizeMenu({
  widgets,
  isVisible,
  onToggle,
}: {
  widgets: WidgetOption[];
  isVisible: (id: string) => boolean;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
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

  return (
    <div className="relative" ref={containerRef}>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((o) => !o)}>
        Customize
      </Button>
      {open && (
        <div
          // z-30: above MobileTabBar's fixed z-20 — otherwise, once the
          // widget list grows long enough (10+ items on the rep
          // dashboard, 13 on admin), this menu's bottom rows render
          // underneath the opaque fixed tab bar instead of on top of it.
          // max-h + overflow-y-auto (viewport-relative, not a fixed px
          // value) caps it so it scrolls internally instead of running
          // off the bottom of a short mobile viewport in the first
          // place; max-w guards the same for narrow/zoomed viewports.
          className="absolute right-0 z-30 mt-1 max-h-[70dvh] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-xl border border-black/15 bg-white p-2 shadow-lg dark:border-white/20 dark:bg-neutral-900"
        >
          <p className="px-1 pb-1 text-xs font-medium text-black/50 dark:text-white/50">
            Show on this dashboard
          </p>
          {widgets.map((w) => (
            <label
              key={w.id}
              className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/10"
            >
              <input
                type="checkbox"
                checked={isVisible(w.id)}
                onChange={() => onToggle(w.id)}
              />
              {w.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
