"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { geocodeAddress } from "@/lib/geocode/google";
import type { AppointmentRole } from "./types";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Admin-only page, so every action here re-checks getAdminSession rather
// than the plainer getSession() the rep-facing app/leads/actions.ts uses —
// appointments_update RLS (schema.sql) would also allow an assigned closer,
// but this page is only ever reached via /admin (requireAdmin-gated), so
// admin is the only caller that should ever hit these.

export async function updateAppointmentStatus(
  appointmentId: string,
  statusId: string
): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("appointments")
    .update({ status_id: statusId, updated_at: new Date().toISOString() })
    .eq("id", appointmentId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/appointments");
  return { ok: true };
}

// Used specifically for the "Rescheduled" status — moves scheduled_at to
// the new date in the same update as the status change, mirroring
// AppointmentsRepository.rescheduleAppointment on iOS.
export async function rescheduleAppointment(
  appointmentId: string,
  statusId: string,
  newScheduledAt: string
): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("appointments")
    .update({ status_id: statusId, scheduled_at: newScheduledAt, updated_at: new Date().toISOString() })
    .eq("id", appointmentId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/appointments");
  return { ok: true };
}

// Date-only edit, independent of status — same "editable any time regardless
// of status" behavior William asked for on iOS (AppointmentsRepository.
// updateScheduledAt), not just via the Rescheduled-status flow above.
export async function updateAppointmentScheduledAt(
  appointmentId: string,
  newScheduledAt: string
): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("appointments")
    .update({ scheduled_at: newScheduledAt, updated_at: new Date().toISOString() })
    .eq("id", appointmentId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/appointments");
  return { ok: true };
}

export type AddAppointmentNoteResult =
  | { ok: true; note: { id: string; appointment_id: string; note: string; created_at: string; author_name: string } }
  | { ok: false; error: string };

export async function addAppointmentNote(
  appointmentId: string,
  note: string
): Promise<AddAppointmentNoteResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const text = note.trim();
  if (!text) return { ok: false, error: "Note can't be empty." };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("appointment_notes")
    .insert({ appointment_id: appointmentId, user_id: session.userId, note: text })
    .select("id, note, created_at")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Failed to add note." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", session.userId)
    .single();

  revalidatePath("/admin/appointments");
  return {
    ok: true,
    note: {
      id: data.id,
      appointment_id: appointmentId,
      note: data.note,
      created_at: data.created_at,
      author_name: profile?.full_name ?? session.email,
    },
  };
}

export type AssignmentDiffInput = {
  appointmentId: string;
  openerIds: string[];
  closerIds: string[];
  currentOpenerIds: string[];
  currentCloserIds: string[];
};

// Diffs staged vs. current for each role and applies just the adds/removes
// needed — same approach as AppointmentDetailScreen.saveAssignments() on
// iOS, not a wholesale replace, so an unrelated concurrent change between
// load and save isn't clobbered for entries neither side touched.
export async function saveAppointmentAssignments(input: AssignmentDiffInput): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();

  const toAdd: { user_id: string; role: AppointmentRole }[] = [];
  const toRemove: { user_id: string; role: AppointmentRole }[] = [];

  for (const id of input.openerIds) {
    if (!input.currentOpenerIds.includes(id)) toAdd.push({ user_id: id, role: "opener" });
  }
  for (const id of input.currentOpenerIds) {
    if (!input.openerIds.includes(id)) toRemove.push({ user_id: id, role: "opener" });
  }
  for (const id of input.closerIds) {
    if (!input.currentCloserIds.includes(id)) toAdd.push({ user_id: id, role: "closer" });
  }
  for (const id of input.currentCloserIds) {
    if (!input.closerIds.includes(id)) toRemove.push({ user_id: id, role: "closer" });
  }

  for (const a of toAdd) {
    const { error } = await supabase.from("appointment_assignments").insert({
      appointment_id: input.appointmentId,
      user_id: a.user_id,
      role: a.role,
      assigned_by: session.userId,
    });
    if (error) return { ok: false, error: error.message };
  }

  for (const r of toRemove) {
    const { error } = await supabase
      .from("appointment_assignments")
      .delete()
      .eq("appointment_id", input.appointmentId)
      .eq("user_id", r.user_id)
      .eq("role", r.role);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/appointments");
  return { ok: true };
}

// Not a real confirmation that a deal was actually submitted in
// tempo-deal-tool (a fully separate app/Supabase project with no
// callback) — just records that someone clicked through. See
// appointments.deal_submitted_at's comment in schema.sql.
export async function markDealSubmitted(appointmentId: string): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("appointments")
    .update({ deal_submitted_at: new Date().toISOString() })
    .eq("id", appointmentId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/appointments");
  return { ok: true };
}

const ZIP_RE = /^\d{5}$/;

export type AddManualAppointmentInput = {
  firstName: string | null;
  lastName: string | null;
  addressLine: string;
  city: string | null;
  state: string | null;
  zipcode: string;
  scheduledAt: string; // ISO 8601
  // Same appointment_form_fields.id -> answer shape submitAppointment
  // (app/leads/actions.ts) uses — this is how Additional Opener and
  // Notes get in, same as the normal Leads-flow submission form.
  responses: Record<string, string>;
};

export type AddManualAppointmentResult =
  | {
      ok: true;
      appointment: {
        id: string;
        lead_id: string;
        scheduled_at: string;
        status_id: string;
        custom_field_responses: Record<string, string>;
        created_by: string;
        created_at: string;
        updated_at: string;
        deal_submitted_at: string | null;
      };
      lead: {
        id: string;
        first_name: string | null;
        last_name: string | null;
        address_line: string;
        city: string | null;
        state: string | null;
        zipcode: string;
        lat: number | null;
        lng: number | null;
      };
    }
  | { ok: false; error: string };

// For an appointment that didn't come from a rep knocking a door in the
// Leads flow — e.g. a design request phoned/emailed in directly. Every
// appointment still needs a lead_id (not nullable, schema.sql), so this
// creates a manual lead first (identical to addManualLead in
// app/leads/actions.ts — is_manual: true, same geocode-best-effort
// behavior), then an appointment against it. That manual lead shows up in
// the normal Leads list/map afterward with the same manual marker actual
// cold-knock manual leads get — not a separate code path, just reusing it.
export async function addManualAppointment(
  input: AddManualAppointmentInput
): Promise<AddManualAppointmentResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const addressLine = input.addressLine.trim();
  const zipcode = input.zipcode.trim();
  if (!addressLine) return { ok: false, error: "Address is required." };
  if (!ZIP_RE.test(zipcode)) return { ok: false, error: "Zip must be exactly 5 digits." };

  const city = input.city?.trim() || null;
  const state = input.state?.trim() || null;

  let lat: number | null = null;
  let lng: number | null = null;
  let precision: string | null = null;
  try {
    const fullAddress = [addressLine, city, [state, zipcode].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", ");
    const result = await geocodeAddress(fullAddress);
    lat = result.lat;
    lng = result.lng;
    precision = result.precision;
  } catch {
    // Same fallback as the rep-facing manual lead entry — insert with no
    // coordinates rather than blocking the appointment from being logged.
  }

  const supabase = await createClient();

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      first_name: input.firstName?.trim() || null,
      last_name: input.lastName?.trim() || null,
      address_line: addressLine,
      city,
      state,
      zipcode,
      lat,
      lng,
      geocode_precision: precision,
      geocoded_at: new Date().toISOString(),
      is_manual: true,
      entered_by: session.userId,
    })
    .select("id, first_name, last_name, address_line, city, state, zipcode, lat, lng")
    .single();

  if (leadError || !lead) {
    return { ok: false, error: leadError?.message ?? "Failed to create lead for appointment." };
  }

  const { data: defaultStatus, error: statusError } = await supabase
    .from("appointment_statuses")
    .select("id")
    .eq("is_default", true)
    .single();

  if (statusError || !defaultStatus) {
    return {
      ok: false,
      error: statusError?.message ?? "No default appointment status is configured.",
    };
  }

  const { data: appointment, error: apptError } = await supabase
    .from("appointments")
    .insert({
      lead_id: lead.id,
      scheduled_at: input.scheduledAt,
      status_id: defaultStatus.id,
      custom_field_responses: input.responses,
      created_by: session.userId,
    })
    .select("id, lead_id, scheduled_at, status_id, custom_field_responses, created_by, created_at, updated_at, deal_submitted_at")
    .single();

  if (apptError || !appointment) {
    return { ok: false, error: apptError?.message ?? "Failed to create appointment." };
  }

  revalidatePath("/admin/appointments");
  revalidatePath("/leads");
  return { ok: true, appointment, lead };
}

// Goes through the same update_lead_name_for_appointment RPC iOS and the
// rep-facing submitAppointment action use (app/leads/actions.ts) — not a
// plain leads table update — so a closer assigned outside their normal zip
// territory is handled identically regardless of which app/role edits it.
export async function updateAppointmentLeadName(
  leadId: string,
  firstName: string | null,
  lastName: string | null
): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_lead_name_for_appointment", {
    p_lead_id: leadId,
    p_first_name: firstName,
    p_last_name: lastName,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/appointments");
  return { ok: true };
}
