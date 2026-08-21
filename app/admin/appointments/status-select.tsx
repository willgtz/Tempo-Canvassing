"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";
import type { AppointmentStatus } from "./types";

// Same colored-dot custom-listbox pattern as app/leads/disposition-select.tsx
// — native <option> elements can't render a dot before their label, and a
// button-per-status grid (the old approach here) gets unwieldy once more
// than a handful of statuses are configured.
export function StatusSelect({
  statuses,
  value,
  onChange,
  disabled,
}: {
  statuses: AppointmentStatus[];
  value: string;
  onChange: (status: AppointmentStatus) => void;
  disabled?: boolean;
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

  const selected = statuses.find((s) => s.id === value);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex min-w-40 items-center gap-2 rounded border border-black/15 bg-white px-2 py-1 text-left text-sm text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:bg-transparent dark:text-white dark:hover:bg-white/10"
      >
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: selected?.color ?? "#9ca3af" }}
        />
        <span className="flex-1 truncate">{selected?.name ?? "Select status"}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="h-3.5 w-3.5 shrink-0 text-black/40 dark:text-white/40"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25 12 15.75 4.5 8.25" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 max-h-64 w-56 overflow-y-auto rounded-xl border border-black/15 bg-white p-1 shadow-lg dark:border-white/20 dark:bg-neutral-900">
          {statuses.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10",
                value === s.id && "bg-black/5 dark:bg-white/10"
              )}
            >
              <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
