"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";

export type UnarchiveLeadResult = { ok: true } | { ok: false; error: string };

export async function unarchiveLead(leadId: string): Promise<UnarchiveLeadResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("unarchive_lead", { p_lead_id: leadId });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/leads/archived");
  revalidatePath("/leads");
  revalidatePath("/admin/leads/all");
  return { ok: true };
}
