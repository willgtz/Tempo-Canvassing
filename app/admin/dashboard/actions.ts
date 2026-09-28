"use server";

import { getAdminSession } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { filterAppointmentsByDate } from "@/lib/dashboard/stats";

export type ExportAppointmentsCsvResult = { ok: true; csv: string } | { ok: false; error: string };

type ExportAppointmentRow = {
  id: string;
  lead_id: string;
  scheduled_at: string;
  status_id: string;
  custom_field_responses: Record<string, unknown>;
  created_by: string;
  created_at: string;
  deal_submitted_at: string | null;
};

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

// Admin-only, full-detail appointment export — the dashboard's own
// queries deliberately fetch a leaner column set for the stats above,
// this re-fetches everything needed for a genuinely useful export
// (lead contact info, opener/closer names, booking-form answers) scoped
// to the same date range currently selected on screen.
export async function exportAppointmentsCsv(
  fromDate: string,
  toDate: string
): Promise<ExportAppointmentsCsvResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();

  const { data: allAppointments, error: apptError } = await fetchAllRows<ExportAppointmentRow>((from, to) =>
    supabase
      .from("appointments")
      .select(
        "id, lead_id, scheduled_at, status_id, custom_field_responses, created_by, created_at, deal_submitted_at"
      )
      .order("id")
      .range(from, to)
  );
  if (apptError) return { ok: false, error: apptError.message };

  const appointments = filterAppointmentsByDate(allAppointments, fromDate, toDate);
  if (appointments.length === 0) {
    return { ok: true, csv: "No appointments in this date range.\n" };
  }

  const appointmentIds = appointments.map((a) => a.id);
  const leadIds = Array.from(new Set(appointments.map((a) => a.lead_id)));

  const [
    { data: leads, error: leadsError },
    { data: statuses, error: statusesError },
    { data: assignments, error: assignmentsError },
    { data: formFields, error: formFieldsError },
    { data: profiles, error: profilesError },
  ] = await Promise.all([
    supabase
      .from("leads")
      .select("id, first_name, last_name, address_line, city, state, zipcode, phone")
      .in("id", leadIds),
    supabase.from("appointment_statuses").select("id, name"),
    supabase.from("appointment_assignments").select("appointment_id, user_id, role").in("appointment_id", appointmentIds),
    supabase.from("appointment_form_fields").select("id, label, sort_order").order("sort_order"),
    supabase.from("profiles").select("id, full_name"),
  ]);

  if (leadsError || statusesError || assignmentsError || formFieldsError || profilesError) {
    return {
      ok: false,
      error:
        leadsError?.message ??
        statusesError?.message ??
        assignmentsError?.message ??
        formFieldsError?.message ??
        profilesError?.message ??
        "Failed to load export data.",
    };
  }

  const leadById = new Map((leads ?? []).map((l) => [l.id, l]));
  const statusNameById = new Map((statuses ?? []).map((s) => [s.id, s.name]));
  const nameByUserId = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const formFieldsSorted = formFields ?? [];

  const openersByAppt = new Map<string, string[]>();
  const closersByAppt = new Map<string, string[]>();
  for (const a of assignments ?? []) {
    const map = a.role === "opener" ? openersByAppt : closersByAppt;
    const list = map.get(a.appointment_id) ?? [];
    list.push(nameByUserId.get(a.user_id) ?? "Unknown");
    map.set(a.appointment_id, list);
  }

  const headers = [
    "Appointment ID",
    "Scheduled At",
    "Status",
    "Lead Name",
    "Address",
    "City",
    "State",
    "Zip",
    "Phone",
    "Opener(s)",
    "Closer(s)",
    "Booked By",
    "Booked At",
    "Deal Submitted At",
    ...formFieldsSorted.map((f) => f.label),
  ];

  const rows = appointments
    .slice()
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    .map((a) => {
      const lead = leadById.get(a.lead_id);
      const responses = (a.custom_field_responses ?? {}) as Record<string, unknown>;
      return csvRow([
        a.id,
        new Date(a.scheduled_at).toLocaleString(),
        statusNameById.get(a.status_id) ?? "Unknown",
        lead ? [lead.first_name, lead.last_name].filter(Boolean).join(" ") : "",
        lead?.address_line ?? "",
        lead?.city ?? "",
        lead?.state ?? "",
        lead?.zipcode ?? "",
        lead?.phone ?? "",
        (openersByAppt.get(a.id) ?? []).join("; "),
        (closersByAppt.get(a.id) ?? []).join("; "),
        nameByUserId.get(a.created_by) ?? "Unknown",
        new Date(a.created_at).toLocaleString(),
        a.deal_submitted_at ? new Date(a.deal_submitted_at).toLocaleString() : "",
        ...formFieldsSorted.map((f) => responses[f.id] ?? ""),
      ]);
    });

  return { ok: true, csv: [csvRow(headers), ...rows].join("\n") + "\n" };
}
