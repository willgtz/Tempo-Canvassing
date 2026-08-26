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

export default async function DashboardPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // No manual zip filtering — leads_select RLS already scopes this to
  // whatever the signed-in user can currently see, same as app/leads.
  // door_knock_counts (schema.sql) replaces the old raw lead_history
  // count — it's location-verified server-side and always includes this
  // caller's own row regardless of any grant/leaderboard flag.
  const [
    { data: leads, error: leadsError },
    { data: doorKnockCounts, error: doorKnockError },
    { data: dispositions, error: dispositionsError },
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
    supabase.from("dispositions").select("id, name, color, sort_order").order("sort_order"),
  ]);

  if (leadsError || doorKnockError || dispositionsError) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load dashboard:{" "}
        {leadsError?.message ?? doorKnockError?.message ?? dispositionsError?.message}
      </div>
    );
  }

  const leadsList = leads ?? [];
  const dispositionById = new Map((dispositions ?? []).map((d) => [d.id, d]));
  const myDoorKnocks = ((doorKnockCounts ?? []) as DoorKnockCount[]).find(
    (row) => row.user_id === session.userId
  );

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
    withoutLocation: countWithoutLocation(leadsList),
    manual: countManual(leadsList),
    trend30: dailyCounts(leadsList, 30),
    dispositionBreakdown,
    zipBreakdown,
  };

  return <RepDashboardClient stats={stats} />;
}
