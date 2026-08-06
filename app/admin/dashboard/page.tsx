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

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

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
    { data: dispositions, error: dispositionsError },
    { data: profiles, error: profilesError },
    { data: teamZips, error: teamZipsError },
  ] = await Promise.all([
    supabase.from("leads").select("id, disposition_id, zipcode, lat, is_manual, created_at"),
    supabase.rpc("door_knock_counts", {
      from_date: dateOnly(thirtyDaysAgo),
      to_date: dateOnly(now),
    }),
    supabase.from("dispositions").select("id, name, color, sort_order").order("sort_order"),
    supabase.from("profiles").select("id, full_name, role, active").order("full_name"),
    supabase.rpc("subordinate_zip_assignments", { root_user_id: session.userId }),
  ]);

  if (leadsError || doorKnockError || dispositionsError || profilesError || teamZipsError) {
    return (
      <div className="mx-auto w-full max-w-6xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load dashboard:{" "}
        {leadsError?.message ??
          doorKnockError?.message ??
          dispositionsError?.message ??
          profilesError?.message ??
          teamZipsError?.message}
      </div>
    );
  }

  return (
    <AdminDashboardClient
      leads={leads ?? []}
      doorKnockCounts={doorKnockCounts ?? []}
      dispositions={dispositions ?? []}
      profiles={profiles ?? []}
      teamZips={teamZips ?? []}
    />
  );
}
