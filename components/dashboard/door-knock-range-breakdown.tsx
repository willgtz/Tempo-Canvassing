"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BarChart, type BarChartItem } from "@/components/dashboard/bar-chart";

type DoorKnockCount = { user_id: string; full_name: string; verified_count: number; total_count: number };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Same default window the old rolling-30-days card used, just as a
// starting point — purely a convenience default, not a constraint.
function defaultFrom(today: string): string {
  const d = new Date(`${today}T00:00:00`);
  d.setDate(d.getDate() - 30);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// door_knock_counts (schema.sql) self-scopes via its own internal
// can_view_door_knock_count check — safe to call directly from the
// browser client, same reasoning as the day/month pickers. No server-
// computed initial value exists for an arbitrary custom range, so this
// fetches on mount too (a brief loading flash on first render, unlike
// the day/month cards which start from an already-server-fetched value).
export function DoorKnockRangeBreakdown({
  today,
  repFilter,
}: {
  today: string;
  repFilter: string;
}) {
  const [from, setFrom] = useState(() => defaultFrom(today));
  const [to, setTo] = useState(today);
  const [counts, setCounts] = useState<DoorKnockCount[]>([]);
  const [fetchedRange, setFetchedRange] = useState<{ from: string; to: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rangeValid = from <= to;

  useEffect(() => {
    if (!rangeValid) return;
    if (fetchedRange && fetchedRange.from === from && fetchedRange.to === to) return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .rpc("door_knock_counts", { from_date: from, to_date: to })
      .then(({ data, error: rpcError }) => {
        if (cancelled) return;
        if (rpcError) {
          setError(rpcError.message);
          return;
        }
        setError(null);
        setCounts((data ?? []) as DoorKnockCount[]);
        setFetchedRange({ from, to });
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, rangeValid, fetchedRange]);

  const isLoading =
    rangeValid && (!fetchedRange || fetchedRange.from !== from || fetchedRange.to !== to) && !error;
  const rows = repFilter === "all" ? counts : counts.filter((r) => r.user_id === repFilter);
  const items: BarChartItem[] = rows
    .map((r) => ({ label: r.full_name, value: r.verified_count }))
    .sort((a, b) => b.value - a.value);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={from}
          max={to}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded border border-black/15 px-1.5 py-0.5 text-xs dark:border-white/20 dark:bg-transparent"
        />
        <span className="text-xs text-black/50 dark:text-white/50">to</span>
        <input
          type="date"
          value={to}
          max={today}
          onChange={(e) => setTo(e.target.value)}
          className="rounded border border-black/15 px-1.5 py-0.5 text-xs dark:border-white/20 dark:bg-transparent"
        />
      </div>
      <div className="mt-3">
        {!rangeValid ? (
          <p className="text-xs text-red-600 dark:text-red-400">
            Start date must be on or before the end date.
          </p>
        ) : isLoading ? (
          <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm italic text-black/40 dark:text-white/40">
            No doors knocked in this range.
          </p>
        ) : (
          <BarChart items={items} />
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
