import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { getHicSignedUrl } from "@/lib/hic/storage";
import { EditorClient } from "./editor-client";
import type { HicTemplate, HicTemplateField, HicTemplateVersion } from "@/app/appointments/send-hic/types";

// Long-lived signed URL (1 hour) — unlike the rep-facing review screen's
// 5-minute links (meant to be used immediately), an admin may spend a
// while positioning fields on this same page.
const EDITOR_URL_EXPIRES_SECONDS = 3600;

export default async function TemplateEditorPage({ params }: { params: Promise<{ versionId: string }> }) {
  await requireAdmin();
  const { versionId } = await params;
  const supabase = await createClient();

  const { data: version, error: versionError } = await supabase
    .from("hic_template_versions")
    .select("*")
    .eq("id", versionId)
    .single();
  if (versionError || !version) notFound();

  const [{ data: template }, { data: fields }, { data: otherVersions }, { data: allTemplates }] = await Promise.all([
    supabase.from("hic_templates").select("*").eq("id", version.template_id).single(),
    supabase.from("hic_template_fields").select("*").eq("template_version_id", versionId).order("sort_order"),
    supabase.from("hic_template_versions").select("*").neq("id", versionId).order("version", { ascending: false }),
    supabase.from("hic_templates").select("*").order("key"),
  ]);

  const signedUrl = await getHicSignedUrl(version.storage_path, EDITOR_URL_EXPIRES_SECONDS);

  return (
    <EditorClient
      version={version as HicTemplateVersion}
      template={template as HicTemplate}
      initialFields={(fields ?? []) as HicTemplateField[]}
      signedUrl={signedUrl}
      otherVersions={(otherVersions ?? []) as HicTemplateVersion[]}
      allTemplates={(allTemplates ?? []) as HicTemplate[]}
    />
  );
}
