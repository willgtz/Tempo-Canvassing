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

type DispositionHistoryRow = {
  lead_id: string;
  new_value: string | null;
  changed_at: string;
};

type LeadNoteRow = {
  lead_id: string;
  created_at: string;
};

type AppointmentRow = {
  id: string;
  lead_id: string;
  scheduled_at: string;
  status_id: string;
  created_by: string;
  created_at: string;
};

type AppointmentAssignmentRow = {
  appointment_id: string;
  user_id: string;
  role: "opener" | "closer";
};

type AppointmentNoteRow = {
  appointment_id: string;
  user_id: string;
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
  const laToday = laDateOnly(now);
  // First of the current calendar month, LA-time — the "doors knocked by
  // rep" card now shows a navigable calendar month instead of a rolling
  // 30-day window (DoorKnockMonthBreakdown handles past months entirely
  // client-side); this is just the initial (current-month) server-
  // computed value, same as laToday seeds the day-picker.
  const laFirstOfMonth = `${laToday.slice(0, 7)}-01`;

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
    { data: dispositionHistory, error: dispositionHistoryError },
    { data: leadNotes, error: leadNotesError },
    { data: appointments, error: appointmentsError },
    { data: appointmentAssignments, error: appointmentAssignmentsError },
    { data: appointmentNotes, error: appointmentNotesError },
    { data: appointmentStatuses, error: appointmentStatusesError },
    { data: teamMemberships, error: teamMembershipsError },
    { data: teams, error: teamsError },
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
      from_date: laFirstOfMonth,
      to_date: laToday,
    }),
    // Same RPC, today only (LA-time boundary — see laDateOnly's comment
    // on why toISOString() would be wrong here) — the "who's knocking
    // right now, today" companion to the current-month view above.
    supabase.rpc("door_knock_counts", { from_date: laToday, to_date: laToday }),
    supabase.from("dispositions").select("id, name, color, sort_order").order("sort_order"),
    supabase.from("profiles").select("id, full_name, role, active").order("full_name"),
    supabase.rpc("subordinate_zip_assignments", { root_user_id: session.userId }),
    // No params needed — returns every rep's progress against THEIR OWN
    // stored goal window already; is_admin() short-circuits the internal
    // can_view_door_knock_count check, so this admin always gets every
    // rep's row back regardless of grants.
    supabase.rpc("door_knock_goal_progress"),
    // Raw disposition-CHANGE events (not leads.disposition_id, which is
    // only ever the current value) — drives both "never knocked" (any
    // row here means the lead's been touched at least once) and the
    // weekly disposition trend (new_value is already the disposition's
    // NAME at change time, see updateLeadDisposition/addManualLead in
    // app/leads/actions.ts, so no join back to dispositions is needed).
    fetchAllRows<DispositionHistoryRow>((from, to) =>
      supabase
        .from("lead_history")
        .select("lead_id, new_value, changed_at")
        .eq("field_changed", "disposition")
        .eq("source", "user")
        .order("id")
        .range(from, to)
    ),
    // The other half of "touched at all" — a note with no disposition
    // change still counts as knocked (door_knock_events, schema.sql,
    // unions both the same way).
    fetchAllRows<LeadNoteRow>((from, to) =>
      supabase
        .from("lead_notes")
        .select("lead_id, created_at")
        .is("deleted_at", null)
        .order("id")
        .range(from, to)
    ),
    fetchAllRows<AppointmentRow>((from, to) =>
      supabase
        .from("appointments")
        .select("id, lead_id, scheduled_at, status_id, created_by, created_at")
        .order("id")
        .range(from, to)
    ),
    fetchAllRows<AppointmentAssignmentRow>((from, to) =>
      supabase
        .from("appointment_assignments")
        .select("appointment_id, user_id, role")
        .order("id")
        .range(from, to)
    ),
    fetchAllRows<AppointmentNoteRow>((from, to) =>
      supabase
        .from("appointment_notes")
        .select("appointment_id, user_id")
        .order("id")
        .range(from, to)
    ),
    supabase
      .from("appointment_statuses")
      .select("id, name, color, sort_order, is_default")
      .order("sort_order"),
    supabase.from("team_memberships").select("user_id, team_id"),
    supabase.from("teams").select("id, name").order("name"),
  ]);

  if (
    leadsError ||
    doorKnockError ||
    doorKnockTodayError ||
    dispositionsError ||
    profilesError ||
    teamZipsError ||
    goalError ||
    dispositionHistoryError ||
    leadNotesError ||
    appointmentsError ||
    appointmentAssignmentsError ||
    appointmentNotesError ||
    appointmentStatusesError ||
    teamMembershipsError ||
    teamsError
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
          goalError?.message ??
          dispositionHistoryError?.message ??
          leadNotesError?.message ??
          appointmentsError?.message ??
          appointmentAssignmentsError?.message ??
          appointmentNotesError?.message ??
          appointmentStatusesError?.message ??
          teamMembershipsError?.message ??
          teamsError?.message}
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
      dispositionHistory={dispositionHistory ?? []}
      leadNotes={leadNotes ?? []}
      appointments={appointments ?? []}
      appointmentAssignments={appointmentAssignments ?? []}
      appointmentNotes={appointmentNotes ?? []}
      appointmentStatuses={appointmentStatuses ?? []}
      teamMemberships={teamMemberships ?? []}
      teams={teams ?? []}
      today={laToday}
    />
  );
}
