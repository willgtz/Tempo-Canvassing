"use client";

import { useEffect, useRef, useState } from "react";

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
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded border border-black/15 px-3 py-1 text-sm dark:border-white/20"
      >
        Customize
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-64 rounded border border-black/15 bg-white p-2 shadow-lg dark:border-white/20 dark:bg-neutral-900">
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
