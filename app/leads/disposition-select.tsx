"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";
import type { Disposition } from "./types";

const DEFAULT_COLOR = "#9ca3af";

// Native <select><option> can't render a colored dot before the label
// (options only take plain text), so this is a custom listbox instead —
// same colored-dot convention as the map pins, Badge, and the
// disposition filter pills, so picking a disposition here visually
// matches what it'll look like on the map.
export function DispositionSelect({
  dispositions,
  value,
  onChange,
}: {
  dispositions: Disposition[];
  value: string;
  onChange: (value: string) => void;
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

  const selected = dispositions.find((d) => d.id === value);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-w-40 items-center gap-2 rounded border border-black/15 bg-white px-2 py-1 text-left text-sm text-black hover:bg-black/5 dark:border-white/20 dark:bg-transparent dark:text-white dark:hover:bg-white/10"
      >
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: selected?.color ?? DEFAULT_COLOR }}
        />
        <span className="flex-1 truncate">{selected?.name ?? "No disposition"}</span>
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
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10",
              value === "" && "bg-black/5 dark:bg-white/10"
            )}
          >
            <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: DEFAULT_COLOR }} />
            No disposition
          </button>
          {dispositions.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => {
                onChange(d.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10",
                value === d.id && "bg-black/5 dark:bg-white/10"
              )}
            >
              <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
              {d.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
