"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";

export type DispositionInput = {
  name: string;
  color: string;
  sortOrder: number;
  isDefault: boolean;
};

export type DispositionActionResult = { ok: true } | { ok: false; error: string };

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function normalizeInput(input: DispositionInput): DispositionInput | { error: string } {
  const name = input.name.trim();
  if (!name) return { error: "Name is required." };
  if (!Number.isInteger(input.sortOrder)) return { error: "Sort order must be a whole number." };

  return {
    name,
    color: HEX_COLOR.test(input.color) ? input.color : "#6B7280",
    sortOrder: input.sortOrder,
    isDefault: input.isDefault,
  };
}

export async function createDisposition(input: DispositionInput): Promise<DispositionActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const normalized = normalizeInput(input);
  if ("error" in normalized) return { ok: false, error: normalized.error };

  const supabase = await createClient();

  // Only one disposition should be the "new lead" default.
  if (normalized.isDefault) {
    await supabase.from("dispositions").update({ is_default: false }).eq("is_default", true);
  }

  const { error } = await supabase.from("dispositions").insert({
    name: normalized.name,
    color: normalized.color,
    sort_order: normalized.sortOrder,
    is_default: normalized.isDefault,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "A disposition with that name already exists." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/leads/dispositions");
  return { ok: true };
}

export async function updateDisposition(
  id: string,
  input: DispositionInput
): Promise<DispositionActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const normalized = normalizeInput(input);
  if ("error" in normalized) return { ok: false, error: normalized.error };

  const supabase = await createClient();

  if (normalized.isDefault) {
    await supabase.from("dispositions").update({ is_default: false }).eq("is_default", true).neq("id", id);
  }

  const { error } = await supabase
    .from("dispositions")
    .update({
      name: normalized.name,
      color: normalized.color,
      sort_order: normalized.sortOrder,
      is_default: normalized.isDefault,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "A disposition with that name already exists." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/leads/dispositions");
  return { ok: true };
}

export async function deleteDisposition(id: string): Promise<DispositionActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase.from("dispositions").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        error: "Leads are still using this disposition — reassign them first.",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/leads/dispositions");
  return { ok: true };
}
