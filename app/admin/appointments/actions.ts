"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
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
