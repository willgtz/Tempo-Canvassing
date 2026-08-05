"use client";

import { useEffect, useRef, useState } from "react";

export type Option = { value: string; label: string };

export function SearchableMultiSelect({
  label,
  options,
  selected,
  onChange,
  emptyMessage = "No options",
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (values: string[]) => void;
  emptyMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
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

  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()));

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  const summary =
    selected.length === 0 ? `All ${label.toLowerCase()}` : `${selected.length} ${label.toLowerCase()} selected`;

  return (
    <div className="relative space-y-1" ref={containerRef}>
      <label className="text-xs font-medium">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="block min-w-40 rounded border border-black/15 px-2 py-1 text-left text-sm dark:border-white/20 dark:bg-transparent"
      >
        {summary}
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-56 rounded border border-black/15 bg-white p-2 shadow-lg dark:border-white/20 dark:bg-neutral-900">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="mb-2 w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          />
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-1 py-1 text-xs italic text-black/40 dark:text-white/40">{emptyMessage}</p>
            )}
            {filtered.map((o) => (
              <label
                key={o.value}
                className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/10"
              >
                <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
                {o.label}
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-2 text-xs text-black/60 underline dark:text-white/60"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
