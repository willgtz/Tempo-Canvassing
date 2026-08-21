"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getAdminSession } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { geocodeAddress } from "@/lib/geocode/google";
import type { Lead } from "./types";

export type UpdateDispositionResult = { ok: true } | { ok: false; error: string };

// Any authenticated user who can currently see the lead can change its
// disposition (BUILD_CONTEXT: reps can change disposition, not just
// admins) — leads_update RLS (is_admin OR zipcode in visible_zipcodes)
// is what actually enforces that, this just gives a clean error instead
// of a silent no-op update.
export async function updateLeadDisposition(
  leadId: string,
  dispositionId: string | null,
  // Optional door-knock location capture — purely advisory input. The DB
  // trigger (compute_door_knock_verification_history, schema.sql) is the
  // real system of record: it always recomputes verified/distance_ft
  // itself server-side from these coordinates, ignoring anything else a
  // client might claim, so there's no way to spoof a verified knock by
  // passing fake values here.
  eventLat?: number,
  eventLng?: number
): Promise<UpdateDispositionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();

  const { data: currentLead, error: leadError } = await supabase
    .from("leads")
    .select("disposition_id")
    .eq("id", leadId)
    .single();

  if (leadError || !currentLead) {
    return { ok: false, error: leadError?.message ?? "Lead not found." };
  }

  if (currentLead.disposition_id === dispositionId) {
    return { ok: true };
  }

  const idsToLookUp = [currentLead.disposition_id, dispositionId].filter(
    (id): id is string => id !== null
  );

  const { data: dispositionRows } = idsToLookUp.length
    ? await supabase.from("dispositions").select("id, name").in("id", idsToLookUp)
    : { data: [] as { id: string; name: string }[] };

  const nameById = new Map((dispositionRows ?? []).map((d) => [d.id, d.name]));
  const oldValue = currentLead.disposition_id
    ? (nameById.get(currentLead.disposition_id) ?? "Unknown")
    : "None";
  const newValue = dispositionId ? (nameById.get(dispositionId) ?? "Unknown") : "None";

  const { error: updateError } = await supabase
    .from("leads")
    .update({ disposition_id: dispositionId, updated_at: new Date().toISOString() })
    .eq("id", leadId);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  // This is also the event log a future "doors knocked" dashboard metric
  // (BUILD_CONTEXT Phase 8) would read from — one row per disposition
  // change, attributed to the rep and timestamped. Not building the
  // dashboard itself yet, just noting the data's already here for it.
  const { error: historyError } = await supabase.from("lead_history").insert({
    lead_id: leadId,
    user_id: session.userId,
    field_changed: "disposition",
    old_value: oldValue,
    new_value: newValue,
    event_lat: eventLat ?? null,
    event_lng: eventLng ?? null,
  });

  if (historyError) {
    // The disposition change itself already succeeded — say so, rather
    // than implying the whole operation failed.
    return { ok: false, error: `Saved, but failed to record history: ${historyError.message}` };
  }

  revalidatePath("/leads");
  return { ok: true };
}

export type UpdatePriorSaleDateResult = { ok: true } | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Admin-only: prior_sale_date comes from CSV import (public record data,
// not something reps should be editing) but the source data isn't always
// clean, so an admin needs a way to set/fix it by hand.
export async function updateLeadPriorSaleDate(
  leadId: string,
  priorSaleDate: string | null
): Promise<UpdatePriorSaleDateResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  if (priorSaleDate !== null && !DATE_RE.test(priorSaleDate)) {
    return { ok: false, error: "Invalid date." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ prior_sale_date: priorSaleDate, updated_at: new Date().toISOString() })
    .eq("id", leadId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/leads");
  return { ok: true };
}

export type AddManualLeadInput = {
  firstName: string | null;
  lastName: string | null;
  addressLine: string;
  city: string | null;
  state: string | null;
  zipcode: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

export type AddManualLeadResult = { ok: true; lead: Lead } | { ok: false; error: string };

const ZIP_RE = /^\d{5}$/;

// Cold-knock entry: any authenticated user can add one, in ANY zip
// (not just their assigned ones) — leads_insert_manual RLS is what
// actually allows this, as long as is_manual/entered_by are set correctly.
// Geocoded synchronously (unlike the bulk CSV background job) since it's
// just one address — the wait is a single API call, not worth a progress
// bar for.
export async function addManualLead(input: AddManualLeadInput): Promise<AddManualLeadResult> {
  const session = await getSession();
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
    // Same fallback as bulk upload — insert with no coordinates rather
    // than blocking the rep from logging the door.
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .insert({
      first_name: input.firstName?.trim() || null,
      last_name: input.lastName?.trim() || null,
      address_line: addressLine,
      city,
      state,
      zipcode,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      lat,
      lng,
      geocode_precision: precision,
      geocoded_at: new Date().toISOString(),
      is_manual: true,
      entered_by: session.userId,
    })
    .select(
      "id, first_name, last_name, address_line, city, state, zipcode, lat, lng, geocode_precision, disposition_id, prior_sale_date, is_manual, entered_by, created_at"
    )
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to add lead." };
  }

  const noteText = input.notes?.trim();
  if (noteText) {
    // Best-effort — the lead itself is already saved at this point, so a
    // note-insert failure shouldn't be reported as the whole action failing.
    await supabase.from("lead_notes").insert({
      lead_id: data.id,
      user_id: session.userId,
      note: noteText,
    });
  }

  revalidatePath("/leads");
  return { ok: true, lead: { ...data, entered_by_name: session.fullName } };
}

export type SubmitAppointmentInput = {
  leadId: string;
  scheduledAt: string; // ISO 8601
  responses: Record<string, string>; // appointment_form_fields.id -> answer, every value a string (see iOS Models.swift's customFieldResponses comment for why)
  nameChanged: boolean;
  updatedFirstName: string | null;
  updatedLastName: string | null;
};

export type SubmitAppointmentResult = { ok: true; updatedLead: Lead } | { ok: false; error: string };

// Mirrors AppointmentsRepository.createAppointment + the name-update path in
// NewAppointmentSheet.swift exactly, so an appointment submitted here behaves
// identically to one submitted from the iOS app — same default-status
// lookup, same RPC for the name edit (not a plain table update — a closer
// assigned later could be outside their own zip territory, which
// update_lead_name_for_appointment already accounts for regardless of
// caller), same unconditional refetch afterward so the caller sees the
// lead's disposition auto-flip to "Appt Set"
// (set_lead_appt_status_on_appointment, schema.sql) immediately rather than
// on some unrelated next reload.
export async function submitAppointment(
  input: SubmitAppointmentInput
): Promise<SubmitAppointmentResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();

  if (input.nameChanged) {
    const { error: nameError } = await supabase.rpc("update_lead_name_for_appointment", {
      p_lead_id: input.leadId,
      p_first_name: input.updatedFirstName,
      p_last_name: input.updatedLastName,
    });
    if (nameError) {
      return { ok: false, error: `Couldn't update name: ${nameError.message}` };
    }
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

  const { error: insertError } = await supabase.from("appointments").insert({
    lead_id: input.leadId,
    scheduled_at: input.scheduledAt,
    status_id: defaultStatus.id,
    custom_field_responses: input.responses,
    created_by: session.userId,
  });

  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  const { data: refreshed, error: refetchError } = await supabase
    .from("leads")
    .select(
      "id, first_name, last_name, address_line, city, state, zipcode, lat, lng, geocode_precision, disposition_id, prior_sale_date, is_manual, entered_by, profiles!entered_by(full_name), created_at"
    )
    .eq("id", input.leadId)
    .single();

  if (refetchError || !refreshed) {
    // The appointment itself was created successfully — say so, rather than
    // implying the whole operation failed just because the follow-up
    // refetch hiccuped.
    return {
      ok: false,
      error: `Appointment created, but couldn't refresh the lead: ${refetchError?.message ?? "unknown error"}`,
    };
  }

  const { profiles, ...rest } = refreshed as unknown as Omit<Lead, "entered_by_name"> & {
    profiles: { full_name: string } | null;
  };

  revalidatePath("/leads");
  return { ok: true, updatedLead: { ...rest, entered_by_name: profiles?.full_name ?? null } };
}

export type AddNoteResult =
  | { ok: true; note: { id: string; note: string; created_at: string; author_name: string } }
  | { ok: false; error: string };

export async function addLeadNote(
  leadId: string,
  note: string,
  // Same door-knock location capture as updateLeadDisposition — a note
  // add counts as a door-knock event exactly like a disposition change
  // does (schema.sql's door_knock_events view unions both).
  eventLat?: number,
  eventLng?: number
): Promise<AddNoteResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const text = note.trim();
  if (!text) return { ok: false, error: "Note can't be empty." };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lead_notes")
    .insert({
      lead_id: leadId,
      user_id: session.userId,
      note: text,
      event_lat: eventLat ?? null,
      event_lng: eventLng ?? null,
    })
    .select("id, note, created_at")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to add note." };
  }

  revalidatePath("/leads");
  return {
    ok: true,
    note: {
      id: data.id,
      note: data.note,
      created_at: data.created_at,
      author_name: session.fullName,
    },
  };
}
