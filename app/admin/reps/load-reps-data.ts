import { createClient } from "@/lib/supabase/server";

// Shared by both the Manage (active) and Inactive tabs — both need the
// full, unfiltered profile set to build managerOptions/nameById (an
// active rep can report to a manager who's since gone inactive, and zip
// history can reference someone no longer active too), even though each
// page only renders one active/inactive slice of it.
export async function loadRepsData() {
  const supabase = await createClient();

  const [
    { data: profiles, error },
    { data: assignments, error: assignmentsError },
    { data: historyRows, error: historyError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, email, phone, role, active, manager_id, can_view_company_leaderboard, excluded_from_leaderboard, name_pending"
      )
      .order("full_name"),
    supabase
      .from("zip_assignments")
      .select("id, user_id, zipcode")
      .is("unassigned_at", null)
      .order("zipcode"),
    // Full history (not filtered to active) — zip_assignments already
    // preserves it via assigned_at/unassigned_at (a soft-close on
    // unassign, never a delete — see unassignZip in actions.ts), this
    // is just the first query anywhere that actually reads the
    // closed-out rows.
    supabase
      .from("zip_assignments")
      .select("id, user_id, zipcode, assigned_at, assigned_by, unassigned_at, unassigned_by")
      .order("assigned_at", { ascending: false }),
  ]);

  const loadError = error ?? assignmentsError ?? historyError ?? null;

  const managerOptions = (profiles ?? []).filter((p) =>
    ["team_lead", "admin", "super_admin"].includes(p.role)
  );
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const assignmentsByUser = new Map<string, { id: string; zipcode: string }[]>();
  for (const a of assignments ?? []) {
    const list = assignmentsByUser.get(a.user_id) ?? [];
    list.push({ id: a.id, zipcode: a.zipcode });
    assignmentsByUser.set(a.user_id, list);
  }

  const historyByUser = new Map<
    string,
    {
      id: string;
      zipcode: string;
      assignedAt: string;
      assignedByName: string | null;
      unassignedAt: string | null;
      unassignedByName: string | null;
    }[]
  >();
  for (const h of historyRows ?? []) {
    const list = historyByUser.get(h.user_id) ?? [];
    list.push({
      id: h.id,
      zipcode: h.zipcode,
      assignedAt: h.assigned_at,
      assignedByName: h.assigned_by ? (nameById.get(h.assigned_by) ?? "Unknown") : null,
      unassignedAt: h.unassigned_at,
      unassignedByName: h.unassigned_by ? (nameById.get(h.unassigned_by) ?? "Unknown") : null,
    });
    historyByUser.set(h.user_id, list);
  }

  return {
    error: loadError,
    profiles: profiles ?? [],
    managerOptions,
    nameById,
    assignmentsByUser,
    historyByUser,
  };
}
