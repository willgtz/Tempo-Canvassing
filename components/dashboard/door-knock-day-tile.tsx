"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatStatValue } from "@/lib/dashboard/stats";
import { Card } from "@/components/ui/card";

type DoorKnockCount = { user_id: string; verified_count: number; total_count: number };

// door_knock_counts (schema.sql) self-scopes via its own internal
// can_view_door_knock_count check — safe to call directly from the
// browser client (unlike visible_zipcodes/teammate_ids, which have no
// built-in caller restriction and go through a Route Handler instead).
export function DoorKnockDayTile({
  currentUserId,
  today,
  initialVerified,
  initialTotal,
}: {
  currentUserId: string;
  today: string;
  initialVerified: number;
  initialTotal: number;
}) {
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  // Tagged with the date it was fetched for, so "loading" and "stale"
  // are both just derived from this not matching the selected date —
  // same pattern as the rep effective-zips preview fetch, avoids ever
  // needing a synchronous setState at the top of the effect.
  const [fetched, setFetched] = useState({
    date: today,
    verified: initialVerified,
    total: initialTotal,
  });

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
        const mine = ((data ?? []) as DoorKnockCount[]).find((r) => r.user_id === currentUserId);
        setFetched({ date, verified: mine?.verified_count ?? 0, total: mine?.total_count ?? 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [date, fetched.date, currentUserId]);

  const isLoading = date !== fetched.date && !error;
  const hint =
    !isLoading && fetched.total > fetched.verified
      ? `${fetched.total - fetched.verified} more not counted — too far from the lead's saved location`
      : undefined;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-black/60 dark:text-white/60">Doors knocked</p>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border border-black/15 px-1.5 py-0.5 text-xs dark:border-white/20 dark:bg-transparent"
        />
      </div>
      <p className="mt-1 text-3xl font-semibold">
        {isLoading ? "…" : formatStatValue(fetched.verified)}
      </p>
      {hint && <p className="mt-1 text-xs text-black/50 dark:text-white/50">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </Card>
  );
}
