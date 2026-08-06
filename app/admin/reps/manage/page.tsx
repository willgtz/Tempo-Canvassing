import { getAdminSession } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { RepCard, type ManagedUser } from "../rep-card";

export default async function ManageRepsPage() {
  const session = await getAdminSession();
  const supabase = await createClient();

  const [
    { data: profiles, error },
    { data: assignments, error: assignmentsError },
    { data: historyRows, error: historyError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, email, phone, role, active, manager_id, can_view_company_leaderboard, excluded_from_leaderboard"
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

  if (error || assignmentsError || historyError || !session) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load reps: {error?.message ?? assignmentsError?.message ?? historyError?.message}
      </div>
    );
  }

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

  return (
    <div className="mx-auto w-full max-w-4xl space-y-3 p-6">
      <div>
        <h1 className="text-xl font-semibold">Manage Reps</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Zip assignment is always available. Editing name, email, phone,
          role, manager, or active status requires hitting Edit — you
          can&apos;t edit your own account here, and the last remaining
          admin/super_admin can&apos;t be demoted or deactivated. Removing a
          zip closes it out (keeps history) rather than deleting the row.
        </p>
      </div>

      <div className="space-y-3">
        {(profiles ?? []).map((p) => (
          <RepCard
            key={p.id}
            user={p as ManagedUser}
            managerOptions={managerOptions}
            isSelf={p.id === session.userId}
            managerName={p.manager_id ? (nameById.get(p.manager_id) ?? null) : null}
            initialAssignments={assignmentsByUser.get(p.id) ?? []}
            zipHistory={historyByUser.get(p.id) ?? []}
          />
        ))}
      </div>
    </div>
  );
}
