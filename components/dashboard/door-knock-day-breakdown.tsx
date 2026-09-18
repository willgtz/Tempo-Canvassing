"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BarChart, type BarChartItem } from "@/components/dashboard/bar-chart";

type DoorKnockCount = { user_id: string; full_name: string; verified_count: number; total_count: number };

// door_knock_counts (schema.sql) self-scopes via its own internal
// can_view_door_knock_count check (is_admin() short-circuits it, so an
// admin always gets every rep's row back) — safe to call directly from
// the browser client, same reasoning as the rep dashboard's
// DoorKnockDayTile.
export function DoorKnockDayBreakdown({
  today,
  repFilter,
  initialCounts,
}: {
  today: string;
  repFilter: string; // "all" or a specific user_id
  initialCounts: DoorKnockCount[];
}) {
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  // Tagged with the date it was fetched for — same pattern as
  // DoorKnockDayTile, avoids a synchronous setState at the top of the
  // effect and keeps "loading"/"stale" both derived from one comparison.
  const [fetched, setFetched] = useState({ date: today, counts: initialCounts });

  useEffect(() => {
    if (date === fetched.date) return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .rpc("door_knock_counts", { from_date: date, to_date: date })
      .then(({ data, error: rpcError }) => {
        if (cancelled) return;
        if (rpcError) {
          setError(rpcError.message);
          return;
        }
        setError(null);
        setFetched({ date, counts: (data ?? []) as DoorKnockCount[] });
      });
    return () => {
      cancelled = true;
    };
  }, [date, fetched.date]);

  const isLoading = date !== fetched.date && !error;
  const rows = repFilter === "all" ? fetched.counts : fetched.counts.filter((r) => r.user_id === repFilter);
  const items: BarChartItem[] = rows
    .map((r) => ({ label: r.full_name, value: r.verified_count }))
    .sort((a, b) => b.value - a.value);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-black/50 dark:text-white/50">Day</span>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border border-black/15 px-1.5 py-0.5 text-xs dark:border-white/20 dark:bg-transparent"
        />
      </div>
      <div className="mt-3">
        {isLoading ? (
          <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm italic text-black/40 dark:text-white/40">
            No doors knocked that day.
          </p>
        ) : (
          <BarChart items={items} />
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
