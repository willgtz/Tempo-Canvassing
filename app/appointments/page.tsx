import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AppointmentsClient } from "./appointments-client";
import type {
  Appointment,
  AppointmentAssignment,
  AppointmentLead,
  AppointmentNote,
  AppointmentStatus,
} from "@/app/admin/appointments/types";

type AssignmentJoinRow = {
  id: string;
  appointment_id: string;
  user_id: string;
  role: "opener" | "closer";
  profiles: { full_name: string } | null;
};

type NoteJoinRow = {
  id: string;
  appointment_id: string;
  note: string;
  created_at: string;
  profiles: { full_name: string } | null;
};

// Rep-facing equivalent of app/admin/appointments/page.tsx — same query
// shape, but run as a plain (non-admin) session, so appointments_select
// RLS (schema.sql: "admin or anyone assigned to it") already scopes this
// to just the signed-in rep's own appointments with zero manual
// filtering needed. No admin-only data fetched (no activeProfiles for
// reassignment, no appointment_detail_sections) since RepAppointmentDetail
// deliberately doesn't offer the assignment-editing UI the admin panel
// has — that stays an admin-only action either way, per
// appointment_assignments_admin_write RLS.
export default async function AppointmentsPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const [
    { data: appointments, error: apptError },
    { data: statuses, error: statusError },
  ] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        "id, lead_id, scheduled_at, status_id, custom_field_responses, created_by, created_at, updated_at, deal_submitted_at"
      )
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("appointment_statuses")
      .select("id, name, color, sort_order, is_default")
      .order("sort_order"),
  ]);

  if (apptError || statusError) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load appointments: {(apptError ?? statusError)?.message}
      </div>
    );
  }

  const leadIds = Array.from(new Set((appointments ?? []).map((a) => a.lead_id)));
  const appointmentIds = (appointments ?? []).map((a) => a.id);

  const [{ data: leads }, { data: assignmentRows }, { data: noteRows }] = await Promise.all([
    leadIds.length
      ? supabase
          .from("leads")
          .select("id, first_name, last_name, address_line, city, state, zipcode")
          .in("id", leadIds)
      : Promise.resolve({ data: [] as AppointmentLead[] }),
    appointmentIds.length
      ? supabase
          .from("appointment_assignments")
          .select("id, appointment_id, user_id, role, profiles!user_id(full_name)")
          .in("appointment_id", appointmentIds)
      : Promise.resolve({ data: [] as AssignmentJoinRow[] }),
    appointmentIds.length
      ? supabase
          .from("appointment_notes")
          .select("id, appointment_id, note, created_at, profiles!user_id(full_name)")
          .in("appointment_id", appointmentIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as NoteJoinRow[] }),
  ]);

  const assignments: AppointmentAssignment[] = ((assignmentRows ?? []) as unknown as AssignmentJoinRow[]).map(
    (r) => ({
      id: r.id,
      appointment_id: r.appointment_id,
      user_id: r.user_id,
      role: r.role,
      full_name: r.profiles?.full_name ?? "Unknown",
    })
  );

  const notes: AppointmentNote[] = ((noteRows ?? []) as unknown as NoteJoinRow[]).map((r) => ({
    id: r.id,
    appointment_id: r.appointment_id,
    note: r.note,
    created_at: r.created_at,
    author_name: r.profiles?.full_name ?? "Unknown",
  }));

  return (
    <AppointmentsClient
      currentUserId={session.userId}
      appointments={(appointments ?? []) as Appointment[]}
      statuses={(statuses ?? []) as AppointmentStatus[]}
      leads={(leads ?? []) as AppointmentLead[]}
      initialAssignments={assignments}
      initialNotes={notes}
    />
  );
}
