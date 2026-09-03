"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { geocodeAddress } from "@/lib/geocode/google";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Rep-facing counterpart to app/admin/appointments/actions.ts — gated by
// requireSession() (any active user) rather than requireAdmin(), since
// this page is reachable by any rep. The real authorization boundary is
// still appointments_update RLS (admin or the assigned closer only) —
// this just gets a real user session before attempting the write, same
// "defense in depth, not the actual boundary" pattern used everywhere
// else in this app.
export async function updateMyAppointmentStatus(
  appointmentId: string,
  statusId: string
): Promise<ActionResult> {
  // Called for its side effect (redirects to /login if unauthenticated) —
  // the returned session isn't otherwise needed here, since the actual
  // write is authorized by RLS reading auth.uid() from the Postgres
  // session directly, not from this value.
  await requireSession();
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("appointments")
    .update({ status_id: statusId, updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", appointmentId);

  if (error) return { ok: false, error: error.message };
  if (!count) {
    return { ok: false, error: "You can only change the status of appointments you're the closer for." };
  }

  revalidatePath("/appointments");
  return { ok: true };
}

export type AddAppointmentNoteResult =
  | { ok: true; note: { id: string; appointment_id: string; note: string; created_at: string; author_name: string } }
  | { ok: false; error: string };

export async function addMyAppointmentNote(
  appointmentId: string,
  note: string
): Promise<AddAppointmentNoteResult> {
  const session = await requireSession();

  const text = note.trim();
  if (!text) return { ok: false, error: "Note can't be empty." };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("appointment_notes")
    .insert({ appointment_id: appointmentId, user_id: session.userId, note: text })
    .select("id, note, created_at")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Failed to add note." };

  revalidatePath("/appointments");
  return {
    ok: true,
    note: {
      id: data.id,
      appointment_id: appointmentId,
      note: data.note,
      created_at: data.created_at,
      author_name: session.fullName,
    },
  };
}

const ZIP_RE = /^\d{5}$/;

export type AddMyManualAppointmentInput = {
  firstName: string | null;
  lastName: string | null;
  addressLine: string;
  city: string | null;
  state: string | null;
  zipcode: string;
  scheduledAt: string; // ISO 8601
  responses: Record<string, string>;
};

export type AddMyManualAppointmentResult =
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

// Any rep can log an appointment that didn't come from working a lead in
// the normal flow — same idea as the admin-only manual-appointment entry
// (app/admin/appointments/actions.ts's addManualAppointment), but for
// everyone, and scoped so a rep only ever sees the ones they entered.
//
// Creates a manual lead (leads_insert_manual RLS: any authenticated user)
// through the normal session-scoped client, so that write runs under real
// RLS. The appointments insert itself, and the appointment_assignments
// self-assign, both go through service-role — see createAdminClient's
// case-3 (assignment) and case-4 (appointments RLS bug) comments for why
// each is needed. Every value in both is still hardcoded from this same
// request (the caller's own session, the appointment just created a few
// lines above) — never client-supplied, so this can't be used to write
// anything on anyone else's behalf.
export async function addMyManualAppointment(
  input: AddMyManualAppointmentInput
): Promise<AddMyManualAppointmentResult> {
  const session = await requireSession();

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
    // Same fallback as every other manual-entry path.
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

  // Service-role for this one insert — see createAdminClient's case-4
  // comment: appointments_insert's own policy is `created_by = auth.uid()`
  // with zero admin-conditional logic, but a confirmed RLS enforcement
  // bug reliably fails this exact check for non-admin sessions even when
  // created_by is genuinely their own uid. created_by is still hardcoded
  // to this same request's already-verified session, never client-
  // supplied, so this can't be used to attribute an appointment to anyone
  // else.
  const adminClient = createAdminClient();
  const { data: appointment, error: apptError } = await adminClient
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

  const { error: assignError } = await adminClient.from("appointment_assignments").insert({
    appointment_id: appointment.id,
    user_id: session.userId,
    role: "opener",
    assigned_by: session.userId,
  });

  if (assignError) {
    // The appointment itself was created successfully — say so, rather
    // than implying the whole thing failed. It'll just be admin-only
    // visible until an admin assigns someone (same as before this fix).
    return {
      ok: false,
      error: `Appointment created, but couldn't assign you to it: ${assignError.message}`,
    };
  }

  revalidatePath("/appointments");
  return { ok: true, appointment, lead };
}
