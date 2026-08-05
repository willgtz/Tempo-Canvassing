"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";

// Near-exact copy of app/admin/leads/dispositions/actions.ts — same shape
// (name/color/sort_order/is_default), same default-handling and
// unique-name-violation handling, just targeting appointment_statuses
// instead of dispositions.

export type StatusInput = {
  name: string;
  color: string;
  sortOrder: number;
  isDefault: boolean;
};

export type StatusActionResult = { ok: true } | { ok: false; error: string };

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function normalizeInput(input: StatusInput): StatusInput | { error: string } {
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

export async function createStatus(input: StatusInput): Promise<StatusActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const normalized = normalizeInput(input);
  if ("error" in normalized) return { ok: false, error: normalized.error };

  const supabase = await createClient();

  // Only one status should be the "new appointment" default.
  if (normalized.isDefault) {
    await supabase.from("appointment_statuses").update({ is_default: false }).eq("is_default", true);
  }

  const { error } = await supabase.from("appointment_statuses").insert({
    name: normalized.name,
    color: normalized.color,
    sort_order: normalized.sortOrder,
    is_default: normalized.isDefault,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "A status with that name already exists." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/appointments/statuses");
  return { ok: true };
}

export async function updateStatus(id: string, input: StatusInput): Promise<StatusActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const normalized = normalizeInput(input);
  if ("error" in normalized) return { ok: false, error: normalized.error };

  const supabase = await createClient();

  if (normalized.isDefault) {
    await supabase
      .from("appointment_statuses")
      .update({ is_default: false })
      .eq("is_default", true)
      .neq("id", id);
  }

  const { error } = await supabase
    .from("appointment_statuses")
    .update({
      name: normalized.name,
      color: normalized.color,
      sort_order: normalized.sortOrder,
      is_default: normalized.isDefault,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "A status with that name already exists." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/appointments/statuses");
  return { ok: true };
}

export async function deleteStatus(id: string): Promise<StatusActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase.from("appointment_statuses").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        error: "Appointments are still using this status — change them first.",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/appointments/statuses");
  return { ok: true };
}
