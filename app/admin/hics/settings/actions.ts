"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  HicEmailTemplateType,
  HicPackageRule,
  HicNotificationRecipient,
  HicPanelOption,
} from "@/app/appointments/send-hic/types";

export type SettingsResult = { ok: true } | { ok: false; error: string };

const SETTINGS_PATH = "/admin/hics/settings";

// Every settings write funnels through here so hic_settings_history
// always gets an accurate old -> new row, attributed to the admin who
// made the change — the audit trail the feature spec calls for.
async function writeAppSetting(
  supabase: Awaited<ReturnType<typeof createClient>>,
  changedBy: string,
  key: string,
  newValue: unknown
): Promise<SettingsResult> {
  const { data: old } = await supabase.from("app_settings").select("value").eq("key", key).single();

  const { error } = await supabase
    .from("app_settings")
    .update({ value: newValue, updated_at: new Date().toISOString(), updated_by: changedBy })
    .eq("key", key);
  if (error) return { ok: false, error: error.message };

  await supabase.from("hic_settings_history").insert({
    setting_key: key,
    old_value: old?.value ?? null,
    new_value: newValue,
    changed_by: changedBy,
  });

  return { ok: true };
}

// ------------------------------------------------------------
// Reminders, expiration, and download-access toggles
// ------------------------------------------------------------
export type ReminderSettingsInput = {
  remindersEnabled: boolean;
  reminderDaysBetween: number;
  reminderMaxCount: number;
  linkExpirationDays: number;
  repsCanDownloadSigned: boolean;
};

export async function saveReminderSettings(input: ReminderSettingsInput): Promise<SettingsResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };
  if (!(input.reminderDaysBetween > 0)) return { ok: false, error: "Days between reminders must be greater than 0." };
  if (!(input.reminderMaxCount >= 0)) return { ok: false, error: "Max reminders must be 0 or more." };
  if (!(input.linkExpirationDays > 0)) return { ok: false, error: "Link expiration must be greater than 0." };

  const supabase = await createClient();
  const writes = await Promise.all([
    writeAppSetting(supabase, session.userId, "hic_reminders_enabled", input.remindersEnabled),
    writeAppSetting(supabase, session.userId, "hic_reminder_days_between", input.reminderDaysBetween),
    writeAppSetting(supabase, session.userId, "hic_reminder_max_count", input.reminderMaxCount),
    writeAppSetting(supabase, session.userId, "hic_link_expiration_days", input.linkExpirationDays),
    writeAppSetting(supabase, session.userId, "hic_reps_can_download_signed", input.repsCanDownloadSigned),
  ]);
  const failed = writes.find((w) => !w.ok);
  if (failed) return failed;

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

// ------------------------------------------------------------
// Contract-price formula + defaults + mismatch threshold
// ------------------------------------------------------------
export type FormulaDefaultsInput = {
  degradationRate: number;
  termYears: number;
  defaultTaxCredit: number;
  defaultAmountDueAtSigning: number;
  defaultContractorName: string;
  monthlyPaymentMismatchThreshold: number;
};

export async function saveFormulaDefaults(input: FormulaDefaultsInput): Promise<SettingsResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };
  if (!(input.degradationRate >= 0) || input.degradationRate >= 1) {
    return { ok: false, error: "Degradation rate must be between 0 and 1." };
  }
  if (!(input.termYears > 0)) return { ok: false, error: "Term years must be greater than 0." };
  if (!(input.defaultTaxCredit >= 0)) return { ok: false, error: "Default tax credit can't be negative." };
  if (!(input.defaultAmountDueAtSigning >= 0)) return { ok: false, error: "Default amount due can't be negative." };
  if (!input.defaultContractorName.trim()) return { ok: false, error: "Contractor name is required." };
  if (!(input.monthlyPaymentMismatchThreshold >= 0)) {
    return { ok: false, error: "Mismatch threshold can't be negative." };
  }

  const supabase = await createClient();
  const writes = await Promise.all([
    writeAppSetting(supabase, session.userId, "hic_degradation_rate", input.degradationRate),
    writeAppSetting(supabase, session.userId, "hic_term_years", input.termYears),
    writeAppSetting(supabase, session.userId, "hic_default_tax_credit", input.defaultTaxCredit),
    writeAppSetting(supabase, session.userId, "hic_default_amount_due_at_signing", input.defaultAmountDueAtSigning),
    writeAppSetting(supabase, session.userId, "hic_default_contractor_name", input.defaultContractorName.trim()),
    writeAppSetting(
      supabase,
      session.userId,
      "hic_monthly_payment_mismatch_threshold",
      input.monthlyPaymentMismatchThreshold
    ),
  ]);
  const failed = writes.find((w) => !w.ok);
  if (failed) return failed;

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

// ------------------------------------------------------------
// Escalator / kWh-rate option lists
// ------------------------------------------------------------
export async function saveOptionLists(escalatorOptions: number[], kwhRateOptions: number[]): Promise<SettingsResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };
  if (escalatorOptions.length === 0) return { ok: false, error: "Escalator list can't be empty." };
  if (kwhRateOptions.length === 0) return { ok: false, error: "kWh rate list can't be empty." };
  if (escalatorOptions.some((n) => !(n >= 0) || n >= 1)) {
    return { ok: false, error: "Escalator values must be between 0 and 1 (e.g. 0.0299 for 2.99%)." };
  }
  if (kwhRateOptions.some((n) => !(n >= 0))) return { ok: false, error: "kWh rate values can't be negative." };

  const supabase = await createClient();
  const sortedEscalator = [...new Set(escalatorOptions)].sort((a, b) => a - b);
  const sortedKwhRate = [...new Set(kwhRateOptions)].sort((a, b) => a - b);

  const writes = await Promise.all([
    writeAppSetting(supabase, session.userId, "hic_escalator_options", sortedEscalator),
    writeAppSetting(supabase, session.userId, "hic_kwh_rate_options", sortedKwhRate),
  ]);
  const failed = writes.find((w) => !w.ok);
  if (failed) return failed;

  revalidatePath(SETTINGS_PATH);
  revalidatePath("/appointments");
  revalidatePath("/admin/hics");
  return { ok: true };
}

// ------------------------------------------------------------
// Panels per financing type
// ------------------------------------------------------------
export type PanelOptionResult = { ok: true; panel: HicPanelOption } | { ok: false; error: string };

export async function addPanelOption(
  financingTypeId: string,
  modelName: string,
  wattageW: number
): Promise<PanelOptionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };
  if (!modelName.trim()) return { ok: false, error: "Model name is required." };
  if (!(wattageW > 0)) return { ok: false, error: "Wattage must be greater than 0." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hic_panel_options")
    .insert({ financing_type_id: financingTypeId, model_name: modelName.trim(), wattage_w: wattageW })
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to add panel." };

  await supabase.from("hic_settings_history").insert({
    setting_key: "hic_panel_options",
    old_value: null,
    new_value: data,
    changed_by: session.userId,
  });

  revalidatePath(SETTINGS_PATH);
  return { ok: true, panel: data as HicPanelOption };
}

export async function updatePanelOption(
  id: string,
  modelName: string,
  wattageW: number,
  isActive: boolean
): Promise<SettingsResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };
  if (!modelName.trim()) return { ok: false, error: "Model name is required." };
  if (!(wattageW > 0)) return { ok: false, error: "Wattage must be greater than 0." };

  const supabase = await createClient();
  const { data: old } = await supabase.from("hic_panel_options").select("*").eq("id", id).single();
  const { error } = await supabase
    .from("hic_panel_options")
    .update({ model_name: modelName.trim(), wattage_w: wattageW, is_active: isActive })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await supabase.from("hic_settings_history").insert({
    setting_key: "hic_panel_options",
    old_value: old ?? null,
    new_value: { ...old, model_name: modelName.trim(), wattage_w: wattageW, is_active: isActive },
    changed_by: session.userId,
  });

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

export async function deletePanelOption(id: string): Promise<SettingsResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { data: old } = await supabase.from("hic_panel_options").select("*").eq("id", id).single();
  const { error } = await supabase.from("hic_panel_options").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  await supabase.from("hic_settings_history").insert({
    setting_key: "hic_panel_options",
    old_value: old ?? null,
    new_value: null,
    changed_by: session.userId,
  });

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

// ------------------------------------------------------------
// Equipment supplement defaults — single row
// ------------------------------------------------------------
export type EquipmentSupplementDefaultsInput = {
  inverterMakeModel: string;
  inverterQuantity: number;
  rackingManufacturer: string;
  rackingModel: string;
};

export async function saveEquipmentSupplementDefaults(
  input: EquipmentSupplementDefaultsInput
): Promise<SettingsResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };
  if (!input.inverterMakeModel.trim()) return { ok: false, error: "Inverter make/model is required." };
  if (!(input.inverterQuantity > 0)) return { ok: false, error: "Inverter quantity must be greater than 0." };
  if (!input.rackingManufacturer.trim()) return { ok: false, error: "Racking manufacturer is required." };
  if (!input.rackingModel.trim()) return { ok: false, error: "Racking model is required." };

  const supabase = await createClient();
  const { data: old } = await supabase.from("hic_equipment_supplement_defaults").select("*").limit(1).single();
  if (!old) return { ok: false, error: "No equipment supplement defaults row found." };

  const newValue = {
    inverter_make_model: input.inverterMakeModel.trim(),
    inverter_quantity: input.inverterQuantity,
    racking_manufacturer: input.rackingManufacturer.trim(),
    racking_model: input.rackingModel.trim(),
  };

  const { error } = await supabase
    .from("hic_equipment_supplement_defaults")
    .update({ ...newValue, updated_at: new Date().toISOString(), updated_by: session.userId })
    .eq("id", old.id);
  if (error) return { ok: false, error: error.message };

  await supabase.from("hic_settings_history").insert({
    setting_key: "hic_equipment_supplement_defaults",
    old_value: old,
    new_value: newValue,
    changed_by: session.userId,
  });

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

// ------------------------------------------------------------
// Document package rules
// ------------------------------------------------------------
export type PackageRuleResult = { ok: true; rule: HicPackageRule } | { ok: false; error: string };

export type PackageRuleInput = {
  templateKey: string;
  financingTypeId: string | null;
  conditionType: "always" | "city_in_list";
  cityList: string[] | null;
  isEnabled: boolean;
  sortOrder: number;
};

function normalizePackageRuleInput(input: PackageRuleInput) {
  return {
    template_key: input.templateKey.trim(),
    financing_type_id: input.financingTypeId,
    condition_type: input.conditionType,
    city_list:
      input.conditionType === "city_in_list"
        ? (input.cityList ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean)
        : null,
    is_enabled: input.isEnabled,
    sort_order: input.sortOrder,
  };
}

export async function addPackageRule(input: PackageRuleInput): Promise<PackageRuleResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };
  if (!input.templateKey.trim()) return { ok: false, error: "Template key is required." };
  if (input.conditionType === "city_in_list" && (!input.cityList || input.cityList.length === 0)) {
    return { ok: false, error: "At least one city is required for a city-based rule." };
  }

  const supabase = await createClient();
  const row = normalizePackageRuleInput(input);
  const { data, error } = await supabase
    .from("hic_package_rules")
    .insert({ ...row, updated_by: session.userId })
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to add rule." };

  await supabase.from("hic_settings_history").insert({
    setting_key: "hic_package_rules",
    old_value: null,
    new_value: data,
    changed_by: session.userId,
  });

  revalidatePath(SETTINGS_PATH);
  return { ok: true, rule: data as HicPackageRule };
}

export async function updatePackageRule(id: string, input: PackageRuleInput): Promise<SettingsResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };
  if (!input.templateKey.trim()) return { ok: false, error: "Template key is required." };
  if (input.conditionType === "city_in_list" && (!input.cityList || input.cityList.length === 0)) {
    return { ok: false, error: "At least one city is required for a city-based rule." };
  }

  const supabase = await createClient();
  const { data: old } = await supabase.from("hic_package_rules").select("*").eq("id", id).single();
  const row = normalizePackageRuleInput(input);
  const { error } = await supabase
    .from("hic_package_rules")
    .update({ ...row, updated_at: new Date().toISOString(), updated_by: session.userId })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await supabase.from("hic_settings_history").insert({
    setting_key: "hic_package_rules",
    old_value: old ?? null,
    new_value: row,
    changed_by: session.userId,
  });

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

export async function deletePackageRule(id: string): Promise<SettingsResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { data: old } = await supabase.from("hic_package_rules").select("*").eq("id", id).single();
  const { error } = await supabase.from("hic_package_rules").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  await supabase.from("hic_settings_history").insert({
    setting_key: "hic_package_rules",
    old_value: old ?? null,
    new_value: null,
    changed_by: session.userId,
  });

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

// ------------------------------------------------------------
// "HIC Signed" notification recipients
// ------------------------------------------------------------
export type NotificationRecipientResult =
  | { ok: true; recipient: HicNotificationRecipient }
  | { ok: false; error: string };

export type NotificationRecipientInput = {
  recipientType: "user" | "email";
  userId: string | null;
  rawEmail: string | null;
  notifyOnSigned: boolean;
  notifyOnViewed: boolean;
  notifyOnDeclined: boolean;
};

export async function addNotificationRecipient(
  input: NotificationRecipientInput
): Promise<NotificationRecipientResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };
  if (input.recipientType === "user" && !input.userId) return { ok: false, error: "Pick a user." };
  if (input.recipientType === "email" && !input.rawEmail?.trim()) return { ok: false, error: "Enter an email address." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hic_notification_recipients")
    .insert({
      recipient_type: input.recipientType,
      user_id: input.recipientType === "user" ? input.userId : null,
      raw_email: input.recipientType === "email" ? input.rawEmail?.trim() : null,
      notify_on_signed: input.notifyOnSigned,
      notify_on_viewed: input.notifyOnViewed,
      notify_on_declined: input.notifyOnDeclined,
    })
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to add recipient." };

  await supabase.from("hic_settings_history").insert({
    setting_key: "hic_notification_recipients",
    old_value: null,
    new_value: data,
    changed_by: session.userId,
  });

  revalidatePath(SETTINGS_PATH);
  return { ok: true, recipient: data as HicNotificationRecipient };
}

export async function updateNotificationRecipientFlags(
  id: string,
  notifyOnSigned: boolean,
  notifyOnViewed: boolean,
  notifyOnDeclined: boolean
): Promise<SettingsResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { data: old } = await supabase.from("hic_notification_recipients").select("*").eq("id", id).single();
  const { error } = await supabase
    .from("hic_notification_recipients")
    .update({ notify_on_signed: notifyOnSigned, notify_on_viewed: notifyOnViewed, notify_on_declined: notifyOnDeclined })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await supabase.from("hic_settings_history").insert({
    setting_key: "hic_notification_recipients",
    old_value: old ?? null,
    new_value: {
      ...old,
      notify_on_signed: notifyOnSigned,
      notify_on_viewed: notifyOnViewed,
      notify_on_declined: notifyOnDeclined,
    },
    changed_by: session.userId,
  });

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

export async function deleteNotificationRecipient(id: string): Promise<SettingsResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { data: old } = await supabase.from("hic_notification_recipients").select("*").eq("id", id).single();
  const { error } = await supabase.from("hic_notification_recipients").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  await supabase.from("hic_settings_history").insert({
    setting_key: "hic_notification_recipients",
    old_value: old ?? null,
    new_value: null,
    changed_by: session.userId,
  });

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

// ------------------------------------------------------------
// Email templates — editing only; the set of (email_type, language)
// rows is fixed by the table's own check constraint and seeded at
// migration time, so there's no add/delete here.
// ------------------------------------------------------------
export async function saveEmailTemplate(
  emailType: HicEmailTemplateType,
  language: "en" | "es",
  subject: string,
  body: string
): Promise<SettingsResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };
  if (!subject.trim()) return { ok: false, error: "Subject is required." };
  if (!body.trim()) return { ok: false, error: "Body is required." };

  const supabase = await createClient();
  const { data: old } = await supabase
    .from("hic_email_templates")
    .select("*")
    .eq("email_type", emailType)
    .eq("language", language)
    .single();

  const { error } = await supabase
    .from("hic_email_templates")
    .update({ subject: subject.trim(), body, updated_at: new Date().toISOString(), updated_by: session.userId })
    .eq("email_type", emailType)
    .eq("language", language);
  if (error) return { ok: false, error: error.message };

  await supabase.from("hic_settings_history").insert({
    setting_key: `hic_email_templates:${emailType}:${language}`,
    old_value: old ?? null,
    new_value: { subject: subject.trim(), body },
    changed_by: session.userId,
  });

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}
