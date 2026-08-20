"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

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
