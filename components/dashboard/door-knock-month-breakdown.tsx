"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BarChart, type BarChartItem } from "@/components/dashboard/bar-chart";

type DoorKnockCount = { user_id: string; full_name: string; verified_count: number; total_count: number };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// offset 0 = the calendar month `today` falls in, -1 = one month back,
// etc. — capped at 0 (no future months) by the caller, not here.
function monthBounds(today: string, offset: number): { from: string; to: string; label: string } {
  const [y, m] = today.split("-").map(Number);
  const base = new Date(y, m - 1 + offset, 1);
  const from = new Date(base.getFullYear(), base.getMonth(), 1);
  const to = new Date(base.getFullYear(), base.getMonth() + 1, 0); // last day of that month
  return {
    from: `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`,
    to: `${to.getFullYear()}-${pad(to.getMonth() + 1)}-${pad(to.getDate())}`,
    label: base.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
  };
}

// door_knock_counts (schema.sql) self-scopes via its own internal
// can_view_door_knock_count check (is_admin() short-circuits it) — safe
// to call directly from the browser client, same reasoning as the day
// picker.
export function DoorKnockMonthBreakdown({
  today,
  repFilter,
  initialCounts,
}: {
  today: string;
  repFilter: string; // "all" or a specific user_id
  initialCounts: DoorKnockCount[];
}) {
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Tagged with the month offset it was fetched for — same pattern as
  // the day/range pickers, avoids a synchronous setState at the top of
  // the effect.
  const [fetched, setFetched] = useState({ offset: 0, counts: initialCounts });

  useEffect(() => {
    if (offset === fetched.offset) return;
    let cancelled = false;
    const { from, to } = monthBounds(today, offset);
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
        setFetched({ offset, counts: (data ?? []) as DoorKnockCount[] });
      });
    return () => {
      cancelled = true;
    };
  }, [offset, fetched.offset, today]);

  const isLoading = offset !== fetched.offset && !error;
  const { label } = monthBounds(today, offset);
  const rows = repFilter === "all" ? fetched.counts : fetched.counts.filter((r) => r.user_id === repFilter);
  const items: BarChartItem[] = rows
    .map((r) => ({ label: r.full_name, value: r.verified_count }))
    .sort((a, b) => b.value - a.value);

  return (
    <div>
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setOffset((o) => o - 1)}
          className="rounded border border-black/15 px-2 py-0.5 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          aria-label="Previous month"
        >
          ←
        </button>
        <span className="text-xs font-medium">{label}</span>
        <button
          type="button"
          onClick={() => setOffset((o) => Math.min(0, o + 1))}
          disabled={offset === 0}
          className="rounded border border-black/15 px-2 py-0.5 text-xs hover:bg-black/5 disabled:opacity-40 disabled:hover:bg-transparent dark:border-white/20 dark:hover:bg-white/10"
          aria-label="Next month"
        >
          →
        </button>
      </div>
      <div className="mt-3">
        {isLoading ? (
          <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm italic text-black/40 dark:text-white/40">
            No doors knocked that month.
          </p>
        ) : (
          <BarChart items={items} />
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
