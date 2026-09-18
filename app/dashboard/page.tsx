import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import {
  countInLastDays,
  countByDisposition,
  countByZip,
  countWithoutLocation,
  countManual,
  dailyCounts,
  laDateOnly,
} from "@/lib/dashboard/stats";
import { RepDashboardClient } from "./rep-dashboard-client";

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type DoorKnockCount = {
  user_id: string;
  full_name: string;
  verified_count: number;
  total_count: number;
};

type DashboardLeadRow = {
  id: string;
  disposition_id: string | null;
  zipcode: string;
  lat: number | null;
  is_manual: boolean;
  created_at: string;
};

type GoalProgressRow = {
  goal_id: string;
  user_id: string;
  full_name: string;
  target_count: number;
  start_date: string;
  end_date: string;
  verified_count: number;
};

export default async function DashboardPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const laToday = laDateOnly(now);

  // No manual zip filtering — leads_select RLS already scopes this to
  // whatever the signed-in user can currently see, same as app/leads.
  // door_knock_counts (schema.sql) replaces the old raw lead_history
  // count — it's location-verified server-side and always includes this
  // caller's own row regardless of any grant/leaderboard flag. Called
  // twice: the existing 30-day rolling window, and a second call scoped
  // to just today (laToday for both from/to) for the daily counter.
  const [
    { data: leads, error: leadsError },
    { data: doorKnockCounts, error: doorKnockError },
    { data: doorKnockCountsToday, error: doorKnockTodayError },
    { data: dispositions, error: dispositionsError },
    { data: goalRows, error: goalError },
  ] = await Promise.all([
    fetchAllRows<DashboardLeadRow>((from, to) =>
      supabase
        .from("leads")
        .select("id, disposition_id, zipcode, lat, is_manual, created_at")
        .order("id")
        .range(from, to)
    ),
    supabase.rpc("door_knock_counts", {
      from_date: dateOnly(thirtyDaysAgo),
      to_date: dateOnly(now),
    }),
    supabase.rpc("door_knock_counts", { from_date: laToday, to_date: laToday }),
    supabase.from("dispositions").select("id, name, color, sort_order").order("sort_order"),
    supabase.rpc("door_knock_goal_progress"),
  ]);

  if (leadsError || doorKnockError || doorKnockTodayError || dispositionsError || goalError) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load dashboard:{" "}
        {leadsError?.message ??
          doorKnockError?.message ??
          doorKnockTodayError?.message ??
          dispositionsError?.message ??
          goalError?.message}
      </div>
    );
  }

  const leadsList = leads ?? [];
  const dispositionById = new Map((dispositions ?? []).map((d) => [d.id, d]));
  const myDoorKnocks = ((doorKnockCounts ?? []) as DoorKnockCount[]).find(
    (row) => row.user_id === session.userId
  );
  const myDoorKnocksToday = ((doorKnockCountsToday ?? []) as DoorKnockCount[]).find(
    (row) => row.user_id === session.userId
  );

  // door_knock_goal_progress() already scopes rows to whoever the caller
  // is allowed to see via can_view_door_knock_count — filtering to
  // session.userId here mirrors the same defensive pattern the other
  // door-knock queries on this page already use with .find().
  const myGoalRows = ((goalRows ?? []) as GoalProgressRow[])
    .filter((r) => r.user_id === session.userId)
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  const currentGoal = myGoalRows[0] ?? null;
  const pastGoals = myGoalRows.slice(1);

  const dispositionBreakdown = Array.from(countByDisposition(leadsList), ([id, count]) => ({
    label: id ? (dispositionById.get(id)?.name ?? "Unknown") : "No disposition",
    value: count,
    color: id ? dispositionById.get(id)?.color : undefined,
  })).sort((a, b) => b.value - a.value);

  const zipBreakdown = Array.from(countByZip(leadsList), ([zip, count]) => ({
    label: zip,
    value: count,
  })).sort((a, b) => b.value - a.value);

  const stats = {
    total: leadsList.length,
    last7: countInLastDays(leadsList, 7),
    last30: countInLastDays(leadsList, 30),
    doorsKnocked30: myDoorKnocks?.verified_count ?? 0,
    doorsKnockedTotal30: myDoorKnocks?.total_count ?? 0,
    doorsKnockedToday: myDoorKnocksToday?.verified_count ?? 0,
    doorsKnockedTotalToday: myDoorKnocksToday?.total_count ?? 0,
    withoutLocation: countWithoutLocation(leadsList),
    manual: countManual(leadsList),
    trend30: dailyCounts(leadsList, 30),
    dispositionBreakdown,
    zipBreakdown,
  };

  return (
    <RepDashboardClient
      stats={stats}
      currentGoal={currentGoal}
      pastGoals={pastGoals}
      today={laToday}
      currentUserId={session.userId}
    />
  );
}
