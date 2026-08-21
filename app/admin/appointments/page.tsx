import { createClient } from "@/lib/supabase/server";
import { AppointmentsExplorer } from "./appointments-explorer";
import type {
  ActiveProfile,
  Appointment,
  AppointmentAssignment,
  AppointmentLead,
  AppointmentNote,
  AppointmentStatus,
} from "./types";
import type { AppointmentFormField } from "@/app/leads/types";

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

// Fallback if appointment_detail_sections is empty (e.g. migration not
// yet run) — matches the seeded default in schema.sql exactly.
const DEFAULT_SECTION_ORDER = ["lead", "schedule", "assigned", "submission_details", "status", "notes"];

export default async function AppointmentsPage() {
  const supabase = await createClient();

  const [
    { data: appointments, error: apptError },
    { data: statuses, error: statusError },
    { data: formFields },
    { data: activeProfiles },
    { data: detailSections },
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
    supabase
      .from("appointment_form_fields")
      .select("id, label, field_type, options, is_required, sort_order")
      .order("sort_order"),
    supabase.from("profiles").select("id, full_name").eq("active", true).order("full_name"),
    supabase.from("appointment_detail_sections").select("key").order("sort_order"),
  ]);

  const sectionOrder = detailSections?.length
    ? detailSections.map((s) => s.key)
    : DEFAULT_SECTION_ORDER;

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
    // flex-1 + min-h-0 chain from here down through AppointmentsExplorer
    // into AppointmentsCalendar — same reasoning as the rep Appointments
    // page: the calendar needs a real height to fill instead of the page
    // just growing to fit 24 hour rows.
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-4 overflow-hidden p-4 md:gap-6 md:p-6">
      {/* Title lives inside AppointmentsExplorer's own compact bar now,
          on every viewport (not just mobile) — the separate desktop-only
          title/description block that used to live here was pushing
          the calendar down for no real benefit once the filter row
          below it was compacted the same way. */}
      <AppointmentsExplorer
        title="Appointments"
        initialAppointments={(appointments ?? []) as Appointment[]}
        statuses={(statuses ?? []) as AppointmentStatus[]}
        formFields={(formFields ?? []) as AppointmentFormField[]}
        leads={(leads ?? []) as AppointmentLead[]}
        initialAssignments={assignments}
        initialNotes={notes}
        activeProfiles={(activeProfiles ?? []) as ActiveProfile[]}
        sectionOrder={sectionOrder}
      />
    </div>
  );
}
