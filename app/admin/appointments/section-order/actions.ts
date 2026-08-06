"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Only sort_order is editable here — key/label are fixed, code-referenced
// identifiers (both apps switch on `key` to know which section content to
// render), not admin-editable data like appointment_statuses' name/color.
export async function updateSectionOrder(id: string, sortOrder: number): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  if (!Number.isInteger(sortOrder)) return { ok: false, error: "Sort order must be a whole number." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("appointment_detail_sections")
    .update({ sort_order: sortOrder })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/appointments/section-order");
  return { ok: true };
}
