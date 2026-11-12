"use server";

import { revalidatePath } from "next/cache";
import { getSuperAdminSession } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionResult = { ok: true } | { ok: false; error: string };

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function revalidateLists(listId?: string) {
  revalidatePath("/admin/leads/special-lists");
  if (listId) revalidatePath(`/admin/leads/special-lists/${listId}`);
  revalidatePath("/leads");
}

function friendlyError(message: string) {
  if (message.includes("special_lists_name_key")) return "A list with that name already exists.";
  if (message.includes("leads_special_list_id_fkey")) {
    return "This list still has leads (including archived ones). Remove them before deleting the list.";
  }
  return message;
}

export async function createSpecialList(
  name: string,
  color: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await getSuperAdminSession();
  if (!session) return { ok: false, error: "Only super admins can create special lists." };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };
  if (!HEX_COLOR.test(color)) return { ok: false, error: "Pick a color." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("special_lists")
    .insert({ name: trimmed, color, created_by: session.userId })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: friendlyError(error?.message ?? "Failed to create list.") };

  revalidateLists();
  return { ok: true, id: data.id };
}

export type SpecialListSettingsInput = {
  name: string;
  color: string;
  mapHiddenDispositionIds: string[];
  mapHiddenAppointmentStatusIds: string[];
  // Tempo CSC only — ignored for other lists.
  cscExcludedStatusIds?: string[];
  cscExcludedCloserIds?: string[];
};

export async function updateSpecialList(
  listId: string,
  input: SpecialListSettingsInput
): Promise<{ ok: true; syncSummary: CscSyncSummary | null } | { ok: false; error: string }> {
  const session = await getSuperAdminSession();
  if (!session) return { ok: false, error: "Only super admins can change special lists." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };
  if (!HEX_COLOR.test(input.color)) return { ok: false, error: "Pick a color." };

  const supabase = await createClient();
  const { data: current, error: currentError } = await supabase
    .from("special_lists")
    .select("is_csc, csc_excluded_closer_ids")
    .eq("id", listId)
    .single();
  if (currentError || !current) return { ok: false, error: currentError?.message ?? "List not found." };

  const update: Record<string, unknown> = {
    name,
    color: input.color,
    map_hidden_disposition_ids: input.mapHiddenDispositionIds,
    map_hidden_appointment_status_ids: input.mapHiddenAppointmentStatusIds,
    updated_at: new Date().toISOString(),
  };
  if (current.is_csc) {
    update.csc_excluded_status_ids = input.cscExcludedStatusIds ?? [];
    update.csc_excluded_closer_ids = input.cscExcludedCloserIds ?? [];
  }

  const { error } = await supabase.from("special_lists").update(update).eq("id", listId);
  if (error) return { ok: false, error: friendlyError(error.message) };

  // A closer change applies right away, in both directions: newly
  // excluded closers' leads are removed, un-excluded ones come back.
  let syncSummary: CscSyncSummary | null = null;
  const previousClosers = new Set<string>(current.csc_excluded_closer_ids ?? []);
  const nextClosers = new Set(input.cscExcludedCloserIds ?? []);
  const closersChanged =
    previousClosers.size !== nextClosers.size || [...nextClosers].some((id) => !previousClosers.has(id));
  if (current.is_csc && closersChanged) {
    const result = await runCscSync();
    if (!result.ok) return { ok: false, error: `Saved, but the CSC check failed: ${result.error}` };
    syncSummary = result.summary;
  }

  revalidateLists(listId);
  return { ok: true, syncSummary };
}

export async function deleteSpecialList(listId: string): Promise<ActionResult> {
  const session = await getSuperAdminSession();
  if (!session) return { ok: false, error: "Only super admins can delete special lists." };

  const supabase = await createClient();
  const { data: list } = await supabase.from("special_lists").select("is_csc").eq("id", listId).single();
  if (list?.is_csc) return { ok: false, error: "Tempo CSC can't be deleted." };

  const { error } = await supabase.from("special_lists").delete().eq("id", listId);
  if (error) return { ok: false, error: friendlyError(error.message) };

  revalidateLists();
  return { ok: true };
}

export async function grantSpecialListAccess(listId: string, userId: string): Promise<ActionResult> {
  const session = await getSuperAdminSession();
  if (!session) return { ok: false, error: "Only super admins can grant access." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("special_list_access")
    .upsert({ list_id: listId, user_id: userId, granted_by: session.userId }, { onConflict: "list_id,user_id", ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };

  revalidateLists(listId);
  return { ok: true };
}

export async function revokeSpecialListAccess(listId: string, userId: string): Promise<ActionResult> {
  const session = await getSuperAdminSession();
  if (!session) return { ok: false, error: "Only super admins can remove access." };

  const supabase = await createClient();
  const { error } = await supabase.from("special_list_access").delete().eq("list_id", listId).eq("user_id", userId);
  if (error) return { ok: false, error: error.message };

  revalidateLists(listId);
  return { ok: true };
}

export type CscSyncSummary = { added: number; attached: number; restored: number; removed: number };

// run_csc_sync is only executable by the service role (the daily cron
// uses the same path), so a super admin's "Run check now" goes through
// the admin client after the session check above it.
async function runCscSync(): Promise<{ ok: true; summary: CscSyncSummary } | { ok: false; error: string }> {
  const { data, error } = await createAdminClient().rpc("run_csc_sync");
  if (error) return { ok: false, error: error.message };
  const result = data as CscSyncSummary & { ok: boolean; error?: string };
  if (!result.ok) return { ok: false, error: result.error ?? "CSC check failed." };
  return { ok: true, summary: result };
}

export async function runCscSyncNow(): Promise<{ ok: true; summary: CscSyncSummary } | { ok: false; error: string }> {
  const session = await getSuperAdminSession();
  if (!session) return { ok: false, error: "Only super admins can run the CSC check." };

  const result = await runCscSync();
  if (result.ok) revalidateLists();
  return result;
}
