import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { getHicSettings } from "@/lib/hic/settings";
import { HicSettingsClient } from "./hic-settings-client";
import type {
  HicEmailTemplate,
  HicEquipmentSupplementDefaults,
  HicFinancingType,
  HicNotificationRecipient,
  HicPackageRule,
  HicPanelOption,
} from "@/app/appointments/send-hic/types";

// Gated by app/admin/layout.tsx's requireAdmin() for the whole /admin
// subtree already, but this page also writes settings via its own
// Server Actions (app/admin/hics/settings/actions.ts), so it calls
// requireAdmin() itself too — same belt-and-suspenders convention as
// app/admin/reps/settings/page.tsx.
export default async function HicSettingsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [
    settings,
    { data: financingTypes },
    { data: panelOptions },
    { data: packageRules },
    { data: notificationRecipients },
    { data: profiles },
    { data: emailTemplates },
    { data: equipmentDefaults },
  ] = await Promise.all([
    getHicSettings(supabase),
    supabase.from("hic_financing_types").select("*").order("sort_order"),
    supabase.from("hic_panel_options").select("*").order("created_at"),
    supabase.from("hic_package_rules").select("*").order("sort_order"),
    supabase.from("hic_notification_recipients").select("*").order("created_at"),
    supabase.from("profiles").select("id, full_name").order("full_name"),
    supabase.from("hic_email_templates").select("*").order("email_type").order("language"),
    supabase.from("hic_equipment_supplement_defaults").select("*").limit(1).single(),
  ]);

  return (
    <HicSettingsClient
      settings={settings}
      financingTypes={(financingTypes ?? []) as HicFinancingType[]}
      panelOptions={(panelOptions ?? []) as HicPanelOption[]}
      packageRules={(packageRules ?? []) as HicPackageRule[]}
      notificationRecipients={(notificationRecipients ?? []) as HicNotificationRecipient[]}
      profiles={(profiles ?? []) as { id: string; full_name: string }[]}
      emailTemplates={(emailTemplates ?? []) as HicEmailTemplate[]}
      equipmentDefaults={equipmentDefaults as HicEquipmentSupplementDefaults}
    />
  );
}
