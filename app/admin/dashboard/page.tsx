import { getAdminSession } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { AdminDashboardClient } from "./admin-dashboard-client";

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

  // is_admin(auth.uid()) bypasses zip-based RLS on leads/lead_history, and
  // subordinate_zip_assignments(admin_id) returns every active assignment
  // company-wide (same bypass, baked into that function) — so this is
  // genuinely everything, not just this admin's own subtree.
  const [
    { data: leads, error: leadsError },
    { data: history, error: historyError },
    { data: dispositions, error: dispositionsError },
    { data: profiles, error: profilesError },
    { data: teamZips, error: teamZipsError },
  ] = await Promise.all([
    supabase.from("leads").select("id, disposition_id, zipcode, lat, is_manual, created_at"),
    supabase
      .from("lead_history")
      .select("user_id, lead_id, changed_at")
      .eq("field_changed", "disposition"),
    supabase.from("dispositions").select("id, name, color, sort_order").order("sort_order"),
    supabase.from("profiles").select("id, full_name, role, active").order("full_name"),
    supabase.rpc("subordinate_zip_assignments", { root_user_id: session.userId }),
  ]);

  if (leadsError || historyError || dispositionsError || profilesError || teamZipsError) {
    return (
      <div className="mx-auto w-full max-w-6xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load dashboard:{" "}
        {leadsError?.message ??
          historyError?.message ??
          dispositionsError?.message ??
          profilesError?.message ??
          teamZipsError?.message}
      </div>
    );
  }

  return (
    <AdminDashboardClient
      leads={leads ?? []}
      history={history ?? []}
      dispositions={dispositions ?? []}
      profiles={profiles ?? []}
      teamZips={teamZips ?? []}
    />
  );
}
