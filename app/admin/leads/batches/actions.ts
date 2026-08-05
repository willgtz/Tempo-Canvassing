"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";

export type DeleteBatchResult =
  | { ok: true; deletedLeadCount: number }
  | { ok: false; error: string };

export async function deleteBatch(batchId: string): Promise<DeleteBatchResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();

  // Hard delete, not soft delete — this exists specifically to undo an
  // accidental upload, so the leads need to actually disappear for every
  // user, not just get hidden. Leads first, then the batch row, since
  // leads.batch_id -> lead_batches has no ON DELETE CASCADE.
  const { error: leadsError, count } = await supabase
    .from("leads")
    .delete({ count: "exact" })
    .eq("batch_id", batchId);

  if (leadsError) {
    return { ok: false, error: leadsError.message };
  }

  const { error: batchError } = await supabase.from("lead_batches").delete().eq("id", batchId);

  if (batchError) {
    return { ok: false, error: batchError.message };
  }

  revalidatePath("/admin/leads/batches");
  return { ok: true, deletedLeadCount: count ?? 0 };
}

export type DeleteLeadResult = { ok: true } | { ok: false; error: string };

// For manually-entered (cold-knock) leads, which have no batch to delete
// through — leads_delete_admin RLS already allows admins to hard-delete
// any lead, this just gives a clean error instead of a silent no-op.
export async function deleteManualLead(leadId: string): Promise<DeleteLeadResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase.from("leads").delete().eq("id", leadId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/leads/batches");
  revalidatePath("/leads");
  return { ok: true };
}
