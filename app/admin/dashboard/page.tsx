import { getAdminSession } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { laDateOnly } from "@/lib/dashboard/stats";
import { AdminDashboardClient } from "./admin-dashboard-client";

type DashboardLeadRow = {
  id: string;
  disposition_id: string | null;
  zipcode: string;
  lat: number | null;
  is_manual: boolean;
  entered_by: string | null;
  created_at: string;
};

export default async function AdminDashboardPage() {
  const session = await getAdminSession();
  if (!session) {
    return (
      <div className="mx-auto w-full max-w-6xl p-6 text-sm text-red-600 dark:text-red-400">
        Unauthorized.
      </div>
    );
  }

  const supabase = await createClient();

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
  const laToday = laDateOnly(now);

  // is_admin(auth.uid()) bypasses zip-based RLS on leads, and
  // subordinate_zip_assignments(admin_id) returns every active assignment
  // company-wide (same bypass, baked into that function) — so this is
  // genuinely everything, not just this admin's own subtree.
  // door_knock_counts (schema.sql) is what replaced the old raw
  // lead_history read — is_admin() also short-circuits its internal
  // can_view_door_knock_count check, so an admin always gets every rep's
  // row back here, verified counts included.
  const [
    { data: leads, error: leadsError },
    { data: doorKnockCounts, error: doorKnockError },
    { data: doorKnockCountsToday, error: doorKnockTodayError },
    { data: dispositions, error: dispositionsError },
    { data: profiles, error: profilesError },
    { data: teamZips, error: teamZipsError },
    { data: goalRows, error: goalError },
  ] = await Promise.all([
    fetchAllRows<DashboardLeadRow>((from, to) =>
      supabase
        .from("leads")
        .select("id, disposition_id, zipcode, lat, is_manual, entered_by, created_at")
        // .range() pagination needs a deterministic order — this query had
        // none before since a single unpaginated fetch didn't need one,
        // but paging by an unordered set risks skipped/duplicated rows
        // across page boundaries.
        .order("id")
        .range(from, to)
    ),
    supabase.rpc("door_knock_counts", {
      from_date: dateOnly(thirtyDaysAgo),
      to_date: dateOnly(now),
    }),
    // Same RPC, today only (LA-time boundary — see laDateOnly's comment
    // on why toISOString() would be wrong here) — the "who's knocking
    // right now, today" companion to the 30-day rolling view above.
    supabase.rpc("door_knock_counts", { from_date: laToday, to_date: laToday }),
    supabase.from("dispositions").select("id, name, color, sort_order").order("sort_order"),
    supabase.from("profiles").select("id, full_name, role, active").order("full_name"),
    supabase.rpc("subordinate_zip_assignments", { root_user_id: session.userId }),
    // No params needed — returns every rep's progress against THEIR OWN
    // stored goal window already; is_admin() short-circuits the internal
    // can_view_door_knock_count check, so this admin always gets every
    // rep's row back regardless of grants.
    supabase.rpc("door_knock_goal_progress"),
  ]);

  if (
    leadsError ||
    doorKnockError ||
    doorKnockTodayError ||
    dispositionsError ||
    profilesError ||
    teamZipsError ||
    goalError
  ) {
    return (
      <div className="mx-auto w-full max-w-6xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load dashboard:{" "}
        {leadsError?.message ??
          doorKnockError?.message ??
          doorKnockTodayError?.message ??
          dispositionsError?.message ??
          profilesError?.message ??
          teamZipsError?.message ??
          goalError?.message}
      </div>
    );
  }

  return (
    <AdminDashboardClient
      leads={leads ?? []}
      doorKnockCounts={doorKnockCounts ?? []}
      doorKnockCountsToday={doorKnockCountsToday ?? []}
      dispositions={dispositions ?? []}
      profiles={profiles ?? []}
      teamZips={teamZips ?? []}
      doorKnockGoals={goalRows ?? []}
      today={laToday}
    />
  );
}
