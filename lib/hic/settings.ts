import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HIC_DEFAULT_AMOUNT_DUE_AT_SIGNING,
  HIC_DEFAULT_CONTRACTOR_NAME,
  HIC_DEFAULT_TAX_CREDIT,
  HIC_DEGRADATION_RATE,
  HIC_ESCALATOR_OPTIONS,
  HIC_KWH_RATE_OPTIONS,
  HIC_LINK_EXPIRATION_DAYS,
  HIC_MONTHLY_PAYMENT_MISMATCH_THRESHOLD,
  HIC_REMINDER_DAYS_BETWEEN,
  HIC_REMINDER_MAX_COUNT,
  HIC_TERM_YEARS,
} from "./defaults";

export type HicSettings = {
  remindersEnabled: boolean;
  reminderDaysBetween: number;
  reminderMaxCount: number;
  linkExpirationDays: number;
  repsCanDownloadSigned: boolean;
  escalatorOptions: number[];
  kwhRateOptions: number[];
  degradationRate: number;
  termYears: number;
  defaultTaxCredit: number;
  defaultAmountDueAtSigning: number;
  defaultContractorName: string;
  monthlyPaymentMismatchThreshold: number;
};

// Single read-path for every admin-editable HIC setting — app_settings
// rows are the source of truth once Phase 5's settings page can write
// them, with lib/hic/defaults.ts's constants kept only as the fallback
// for a missing row (so this never throws if a row hasn't been seeded
// yet in some environment). Any Supabase client works here (RLS allows
// select:true on app_settings for everyone), so the same helper serves
// both RLS-scoped server actions and the service-role cron route.
export async function getHicSettings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>
): Promise<HicSettings> {
  const { data } = await supabase.from("app_settings").select("key, value").like("key", "hic_%");
  const map = Object.fromEntries((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));

  return {
    remindersEnabled: (map.hic_reminders_enabled as boolean | undefined) ?? true,
    reminderDaysBetween: Number(map.hic_reminder_days_between ?? HIC_REMINDER_DAYS_BETWEEN),
    reminderMaxCount: Number(map.hic_reminder_max_count ?? HIC_REMINDER_MAX_COUNT),
    linkExpirationDays: Number(map.hic_link_expiration_days ?? HIC_LINK_EXPIRATION_DAYS),
    repsCanDownloadSigned: (map.hic_reps_can_download_signed as boolean | undefined) ?? true,
    escalatorOptions: (map.hic_escalator_options as number[] | undefined) ?? HIC_ESCALATOR_OPTIONS,
    kwhRateOptions: (map.hic_kwh_rate_options as number[] | undefined) ?? HIC_KWH_RATE_OPTIONS,
    degradationRate: Number(map.hic_degradation_rate ?? HIC_DEGRADATION_RATE),
    termYears: Number(map.hic_term_years ?? HIC_TERM_YEARS),
    defaultTaxCredit: Number(map.hic_default_tax_credit ?? HIC_DEFAULT_TAX_CREDIT),
    defaultAmountDueAtSigning: Number(map.hic_default_amount_due_at_signing ?? HIC_DEFAULT_AMOUNT_DUE_AT_SIGNING),
    defaultContractorName: (map.hic_default_contractor_name as string | undefined) ?? HIC_DEFAULT_CONTRACTOR_NAME,
    monthlyPaymentMismatchThreshold: Number(
      map.hic_monthly_payment_mismatch_threshold ?? HIC_MONTHLY_PAYMENT_MISMATCH_THRESHOLD
    ),
  };
}
