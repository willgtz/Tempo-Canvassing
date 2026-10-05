"use server";

import { revalidatePath } from "next/cache";
import { PDFDocument } from "pdf-lib";
import { getAdminSession } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { uploadHicDocument } from "@/lib/hic/storage";
import type {
  HicTemplate,
  HicTemplateField,
  HicTemplateFieldSignerRole,
  HicTemplateFieldType,
  HicTemplateVersion,
} from "@/app/appointments/send-hic/types";

const TEMPLATES_PATH = "/admin/hics/templates";

async function countPages(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPageCount();
}

// ------------------------------------------------------------
// Templates + versions
// ------------------------------------------------------------
export type CreateTemplateResult =
  | { ok: true; template: HicTemplate; version: HicTemplateVersion }
  | { ok: false; error: string };

export async function createTemplate(formData: FormData): Promise<CreateTemplateResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const key = String(formData.get("key") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const languageRaw = String(formData.get("language") ?? "");
  const language = languageRaw === "en" || languageRaw === "es" ? languageRaw : null;
  const financingTypeId = String(formData.get("financingTypeId") ?? "") || null;
  const file = formData.get("file");

  if (!key) return { ok: false, error: "Template key is required." };
  if (!label) return { ok: false, error: "Label is required." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "A PDF file is required." };

  const supabase = await createClient();
  const { data: template, error: templateError } = await supabase
    .from("hic_templates")
    .insert({ key, label, language, financing_type_id: financingTypeId })
    .select("*")
    .single();
  if (templateError || !template) return { ok: false, error: templateError?.message ?? "Failed to create template." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const pageCount = await countPages(bytes);
  const storagePath = `templates/${key}/v1.pdf`;
  await uploadHicDocument(storagePath, bytes);

  const { data: version, error: versionError } = await supabase
    .from("hic_template_versions")
    .insert({
      template_id: template.id,
      version: 1,
      storage_path: storagePath,
      page_count: pageCount,
      is_active: true,
      created_by: session.userId,
    })
    .select("*")
    .single();
  if (versionError || !version) return { ok: false, error: versionError?.message ?? "Failed to create version." };

  await supabase.from("hic_settings_history").insert({
    setting_key: "hic_templates",
    old_value: null,
    new_value: { template, version },
    changed_by: session.userId,
  });

  revalidatePath(TEMPLATES_PATH);
  return { ok: true, template: template as HicTemplate, version: version as HicTemplateVersion };
}

export type UploadVersionResult = { ok: true; version: HicTemplateVersion } | { ok: false; error: string };

// New PDF for an EXISTING template — becomes an inactive draft version,
// so field-position work can happen in the editor before it goes live
// (see activateTemplateVersion below). Field rows aren't copied forward
// automatically — a brand-new PDF may have completely different page
// positions; use duplicateTemplateFields to start from the old layout
// instead, when that's actually a reasonable starting point.
export async function uploadTemplateVersion(templateId: string, formData: FormData): Promise<UploadVersionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "A PDF file is required." };

  const supabase = await createClient();
  const { data: template, error: templateError } = await supabase
    .from("hic_templates")
    .select("key")
    .eq("id", templateId)
    .single();
  if (templateError || !template) return { ok: false, error: "Template not found." };

  const { data: existingVersions } = await supabase
    .from("hic_template_versions")
    .select("version")
    .eq("template_id", templateId)
    .order("version", { ascending: false })
    .limit(1);
  const nextVersion = (existingVersions?.[0]?.version ?? 0) + 1;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const pageCount = await countPages(bytes);
  const storagePath = `templates/${template.key}/v${nextVersion}.pdf`;
  await uploadHicDocument(storagePath, bytes);

  const { data: version, error: versionError } = await supabase
    .from("hic_template_versions")
    .insert({
      template_id: templateId,
      version: nextVersion,
      storage_path: storagePath,
      page_count: pageCount,
      is_active: false,
      created_by: session.userId,
    })
    .select("*")
    .single();
  if (versionError || !version) return { ok: false, error: versionError?.message ?? "Failed to create version." };

  await supabase.from("hic_settings_history").insert({
    setting_key: "hic_template_versions",
    old_value: null,
    new_value: version,
    changed_by: session.userId,
  });

  revalidatePath(TEMPLATES_PATH);
  return { ok: true, version: version as HicTemplateVersion };
}

export type SettingsResult = { ok: true } | { ok: false; error: string };

// Flips is_active, respecting the one-active-per-template partial
// unique index — deactivate whatever else is active for this template
// FIRST, then activate the target, so there's never a moment with two
// active rows for the same template_id.
export async function activateTemplateVersion(versionId: string): Promise<SettingsResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { data: target, error: targetError } = await supabase
    .from("hic_template_versions")
    .select("id, template_id, version")
    .eq("id", versionId)
    .single();
  if (targetError || !target) return { ok: false, error: "Version not found." };

  // The one point unlabeled fields actually block anything — going
  // live with a field that has nowhere to pull its value from would
  // just stamp blank text (or nothing) onto a real sent document.
  const { count: unlabeledCount } = await supabase
    .from("hic_template_fields")
    .select("id", { count: "exact", head: true })
    .eq("template_version_id", versionId)
    .eq("field_key", "");
  if (unlabeledCount && unlabeledCount > 0) {
    return {
      ok: false,
      error: `${unlabeledCount} field${unlabeledCount === 1 ? "" : "s"} on this version still ${unlabeledCount === 1 ? "has" : "have"} no field key. Fill those in before activating.`,
    };
  }

  const { error: deactivateError } = await supabase
    .from("hic_template_versions")
    .update({ is_active: false })
    .eq("template_id", target.template_id)
    .eq("is_active", true);
  if (deactivateError) return { ok: false, error: deactivateError.message };

  const { error: activateError } = await supabase
    .from("hic_template_versions")
    .update({ is_active: true })
    .eq("id", versionId);
  if (activateError) return { ok: false, error: activateError.message };

  await supabase.from("hic_settings_history").insert({
    setting_key: "hic_template_versions",
    old_value: null,
    new_value: { activated: versionId, version: target.version },
    changed_by: session.userId,
  });

  revalidatePath(TEMPLATES_PATH);
  return { ok: true };
}

// ------------------------------------------------------------
// Field positions
// ------------------------------------------------------------
export type TemplateFieldInput = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  field_key: string;
  field_type: HicTemplateFieldType;
  signer_role: HicTemplateFieldSignerRole;
  font_size: number;
  alignment: "left" | "center" | "right";
  required: boolean;
  format: string | null;
  show_only_if: string | null;
  sort_order: number;
};

export type SaveFieldsResult = { ok: true; fields: HicTemplateField[] } | { ok: false; error: string };

// Full replace, not a diff — the editor always holds the complete
// current field list client-side, so this is simpler and can't drift
// from deleted-but-not-removed rows. Logged once per save (not once per
// field) to keep hic_settings_history readable.
export async function saveTemplateFields(
  versionId: string,
  fields: TemplateFieldInput[]
): Promise<SaveFieldsResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };
  // Deliberately NOT requiring a non-empty field_key here — a long
  // positioning session across many pages shouldn't lose all its work
  // just because a few boxes haven't been labeled yet. Unlabeled
  // fields are flagged in the editor UI instead, and a real field key
  // is only required before a version goes live (activateTemplateVersion).
  for (const f of fields) {
    if (!(f.width > 0) || !(f.height > 0)) return { ok: false, error: "Field width/height must be greater than 0." };
  }

  const supabase = await createClient();
  const { data: old } = await supabase.from("hic_template_fields").select("*").eq("template_version_id", versionId);

  const { error: deleteError } = await supabase.from("hic_template_fields").delete().eq("template_version_id", versionId);
  if (deleteError) return { ok: false, error: deleteError.message };

  if (fields.length > 0) {
    const { error: insertError } = await supabase
      .from("hic_template_fields")
      .insert(fields.map((f) => ({ ...f, template_version_id: versionId })));
    if (insertError) return { ok: false, error: insertError.message };
  }

  const { data: saved, error: fetchError } = await supabase
    .from("hic_template_fields")
    .select("*")
    .eq("template_version_id", versionId)
    .order("sort_order");
  if (fetchError || !saved) return { ok: false, error: fetchError?.message ?? "Failed to reload fields." };

  await supabase.from("hic_settings_history").insert({
    setting_key: "hic_template_fields",
    old_value: { template_version_id: versionId, count: old?.length ?? 0 },
    new_value: { template_version_id: versionId, count: saved.length },
    changed_by: session.userId,
  });

  revalidatePath(TEMPLATES_PATH);
  return { ok: true, fields: saved as HicTemplateField[] };
}

// Copies every field from one version to another, overwriting the
// target's current fields — the starting point for "duplicate English
// layout onto Spanish template, then adjust," since the two documents
// are usually laid out very similarly.
export async function duplicateTemplateFields(
  sourceVersionId: string,
  targetVersionId: string
): Promise<SaveFieldsResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };
  if (sourceVersionId === targetVersionId) return { ok: false, error: "Source and target are the same version." };

  const supabase = await createClient();
  const { data: sourceFields, error: sourceError } = await supabase
    .from("hic_template_fields")
    .select("*")
    .eq("template_version_id", sourceVersionId);
  if (sourceError) return { ok: false, error: sourceError.message };

  const inputs: TemplateFieldInput[] = (sourceFields ?? []).map((f) => ({
    page: f.page,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    field_key: f.field_key,
    field_type: f.field_type,
    signer_role: f.signer_role,
    font_size: f.font_size,
    alignment: f.alignment,
    required: f.required,
    format: f.format,
    show_only_if: f.show_only_if,
    sort_order: f.sort_order,
  }));

  return saveTemplateFields(targetVersionId, inputs);
}
