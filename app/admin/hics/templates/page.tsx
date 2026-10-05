import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { TemplatesClient } from "./templates-client";
import type { HicFinancingType, HicTemplate, HicTemplateVersion } from "@/app/appointments/send-hic/types";

export default async function HicTemplatesPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: templates }, { data: versions }, { data: financingTypes }, { data: fieldCounts }] =
    await Promise.all([
      supabase.from("hic_templates").select("*").order("key"),
      supabase.from("hic_template_versions").select("*").order("version", { ascending: false }),
      supabase.from("hic_financing_types").select("*").order("sort_order"),
      supabase.from("hic_template_fields").select("template_version_id"),
    ]);

  const fieldCountByVersionId = new Map<string, number>();
  for (const row of fieldCounts ?? []) {
    fieldCountByVersionId.set(row.template_version_id, (fieldCountByVersionId.get(row.template_version_id) ?? 0) + 1);
  }

  return (
    <TemplatesClient
      templates={(templates ?? []) as HicTemplate[]}
      versions={(versions ?? []) as HicTemplateVersion[]}
      financingTypes={(financingTypes ?? []) as HicFinancingType[]}
      fieldCountByVersionId={Object.fromEntries(fieldCountByVersionId)}
    />
  );
}
