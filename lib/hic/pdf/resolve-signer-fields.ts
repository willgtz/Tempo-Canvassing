import "server-only";
import { createClient } from "@/lib/supabase/server";
import { resolveApplicableTemplateKeys } from "./fill-hic-package";
import type { Hic } from "@/app/appointments/send-hic/types";

export type SignerField = {
  page: number; // global page number within the merged package PDF
  x: number;
  y: number;
  width: number;
  height: number;
  fieldKey: string;
  fieldType: "signature" | "initials" | "date";
  required: boolean;
};

export type SignerFieldsResult = { fields: SignerField[]; totalPageCount: number };

// Maps a signer's own clickable fields (signature/initials/date-of-
// signing — never text/checkbox, which are already filled at generation
// time) into GLOBAL page numbers within the final merged package PDF,
// not each template's own local page numbers. The signing page renders
// one continuous document (same merge fillHicPackage/generate-draft-
// preview.ts produce), so a field recorded as "page 5 of the HIC
// template" needs to become e.g. "page 5" or "page 12" depending on
// whether anything was merged in before it.
export async function resolveSignerFields(
  hic: Hic,
  signerRole: "homeowner" | "co_borrower"
): Promise<SignerFieldsResult> {
  const supabase = await createClient();
  const templateKeys = await resolveApplicableTemplateKeys(hic);

  const fields: SignerField[] = [];
  let pageOffset = 0;

  for (const templateKey of templateKeys) {
    const { data: template } = await supabase.from("hic_templates").select("id").eq("key", templateKey).single();
    if (!template) continue;

    const { data: version } = await supabase
      .from("hic_template_versions")
      .select("id, page_count")
      .eq("template_id", template.id)
      .eq("is_active", true)
      .single();
    if (!version) continue;

    const { data: templateFields } = await supabase
      .from("hic_template_fields")
      .select("page, x, y, width, height, field_key, field_type, signer_role, required, show_only_if")
      .eq("template_version_id", version.id)
      .in("field_type", ["signature", "initials", "date"])
      .eq("signer_role", signerRole)
      .order("sort_order");

    for (const f of templateFields ?? []) {
      if (f.show_only_if === "has_co_borrower" && !hic.has_co_borrower) continue;
      fields.push({
        page: f.page + pageOffset,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        fieldKey: f.field_key,
        fieldType: f.field_type as "signature" | "initials" | "date",
        required: f.required,
      });
    }

    pageOffset += version.page_count;
  }

  return { fields, totalPageCount: pageOffset };
}
