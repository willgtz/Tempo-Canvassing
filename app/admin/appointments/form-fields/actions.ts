"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";

export type FieldType = "text" | "textarea" | "number" | "date" | "select" | "checkbox";

export type FormFieldInput = {
  label: string;
  fieldType: FieldType;
  options: string[] | null; // only meaningful when fieldType === "select"
  isRequired: boolean;
  sortOrder: number;
};

export type FormFieldActionResult = { ok: true } | { ok: false; error: string };

function normalizeInput(input: FormFieldInput): FormFieldInput | { error: string } {
  const label = input.label.trim();
  if (!label) return { error: "Label is required." };
  if (!Number.isInteger(input.sortOrder)) return { error: "Sort order must be a whole number." };

  const options =
    input.fieldType === "select"
      ? (input.options ?? []).map((o) => o.trim()).filter(Boolean)
      : null;

  if (input.fieldType === "select" && (!options || options.length === 0)) {
    return { error: "A select field needs at least one option." };
  }

  return {
    label,
    fieldType: input.fieldType,
    options,
    isRequired: input.isRequired,
    sortOrder: input.sortOrder,
  };
}

export async function createFormField(input: FormFieldInput): Promise<FormFieldActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const normalized = normalizeInput(input);
  if ("error" in normalized) return { ok: false, error: normalized.error };

  const supabase = await createClient();
  const { error } = await supabase.from("appointment_form_fields").insert({
    label: normalized.label,
    field_type: normalized.fieldType,
    options: normalized.options,
    is_required: normalized.isRequired,
    sort_order: normalized.sortOrder,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/appointments/form-fields");
  return { ok: true };
}

export async function updateFormField(id: string, input: FormFieldInput): Promise<FormFieldActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const normalized = normalizeInput(input);
  if ("error" in normalized) return { ok: false, error: normalized.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("appointment_form_fields")
    .update({
      label: normalized.label,
      field_type: normalized.fieldType,
      options: normalized.options,
      is_required: normalized.isRequired,
      sort_order: normalized.sortOrder,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/appointments/form-fields");
  return { ok: true };
}

export async function deleteFormField(id: string): Promise<FormFieldActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase.from("appointment_form_fields").delete().eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/appointments/form-fields");
  return { ok: true };
}
