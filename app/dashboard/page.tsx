import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  countInLastDays,
  countByDisposition,
  countByZip,
  countWithoutLocation,
  countManual,
  dailyCounts,
  doorsKnockedCount,
} from "@/lib/dashboard/stats";
import { RepDashboardClient } from "./rep-dashboard-client";

export default async function DashboardPage() {
  const session = await requireSession();
  const supabase = await createClient();

  // No manual zip filtering — leads_select RLS already scopes this to
  // whatever the signed-in user can currently see, same as app/leads.
  const [
    { data: leads, error: leadsError },
    { data: history, error: historyError },
    { data: dispositions, error: dispositionsError },
  ] = await Promise.all([
    supabase.from("leads").select("id, disposition_id, zipcode, lat, is_manual, created_at"),
    supabase
      .from("lead_history")
      .select("user_id, changed_at")
      .eq("field_changed", "disposition")
      .eq("user_id", session.userId),
    supabase.from("dispositions").select("id, name, color, sort_order").order("sort_order"),
  ]);

  if (leadsError || historyError || dispositionsError) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load dashboard:{" "}
        {leadsError?.message ?? historyError?.message ?? dispositionsError?.message}
      </div>
    );
  }

  const leadsList = leads ?? [];
  const historyList = history ?? [];
  const dispositionById = new Map((dispositions ?? []).map((d) => [d.id, d]));

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
    doorsKnocked30: doorsKnockedCount(historyList, session.userId, 30),
    withoutLocation: countWithoutLocation(leadsList),
    manual: countManual(leadsList),
    trend30: dailyCounts(leadsList, 30),
    dispositionBreakdown,
    zipBreakdown,
  };

  return <RepDashboardClient stats={stats} />;
}
