"use client";

import { useEffect, useState } from "react";
import { Input, Select } from "@/components/ui/input";
import { formatCurrency, formatPhoneInput } from "@/lib/hic/format";
import { HIC_APR_OPTIONS, HIC_ESCALATOR_OPTIONS, HIC_KWH_RATE_OPTIONS, HIC_LOAN_TERM_OPTIONS } from "@/lib/hic/defaults";
import { getHicOptionLists } from "./actions";
import type { AppointmentLead } from "@/app/admin/appointments/types";
import type { Hic, HicFinancingType, HicFormInput } from "./types";

// Same uppercase section-divider treatment used throughout this app's
// detail panels — groups a long form into scannable chunks.
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
      {children}
    </p>
  );
}

export function blankFormInput(lead: AppointmentLead | null, financingTypeId: string): HicFormInput {
  return {
    financingTypeId,
    language: "en",
    // Never pre-filled from the lead, even though the name is right
    // there — re-entered by the rep for verification, per spec.
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    hasCoBorrower: false,
    coBorrowerName: "",
    coBorrowerPhone: "",
    coBorrowerEmail: "",
    installAddressLine: lead?.address_line ?? "",
    installCity: lead?.city ?? "",
    installState: lead?.state ?? "",
    installZip: lead?.zipcode ?? "",
    systemSizeKw: "",
    estProductionKwh: "",
    firstYearMonthlyPayment: "",
    escalator: HIC_ESCALATOR_OPTIONS[0],
    kwhRate: HIC_KWH_RATE_OPTIONS[0],
    contractPriceManual: "",
    fixedApr: HIC_APR_OPTIONS[0],
    loanTermYears: HIC_LOAN_TERM_OPTIONS[0],
    paymentAfter36Months: "",
    estimatedTaxCredit: "",
    amountDueAtSigning: "",
    monthlyPaymentMismatchAcknowledged: false,
  };
}

export function hicToFormInput(hic: Hic): HicFormInput {
  return {
    financingTypeId: hic.financing_type_id,
    language: hic.language,
    customerName: hic.customer_name,
    customerPhone: hic.customer_phone,
    customerEmail: hic.customer_email,
    hasCoBorrower: hic.has_co_borrower,
    coBorrowerName: hic.co_borrower_name ?? "",
    coBorrowerPhone: hic.co_borrower_phone ?? "",
    coBorrowerEmail: hic.co_borrower_email ?? "",
    installAddressLine: hic.install_address_line,
    installCity: hic.install_city,
    installState: hic.install_state,
    installZip: hic.install_zip,
    systemSizeKw: String(hic.system_size_kw),
    estProductionKwh: String(hic.est_production_kwh),
    firstYearMonthlyPayment: String(hic.first_year_monthly_payment),
    escalator: hic.escalator,
    kwhRate: hic.kwh_rate,
    contractPriceManual: hic.contract_price != null ? String(hic.contract_price) : "",
    fixedApr: hic.fixed_apr ?? HIC_APR_OPTIONS[0],
    loanTermYears: hic.loan_term_years ?? HIC_LOAN_TERM_OPTIONS[0],
    paymentAfter36Months: hic.payment_after_36_months != null ? String(hic.payment_after_36_months) : "",
    estimatedTaxCredit: String(hic.estimated_tax_credit),
    amountDueAtSigning: String(hic.amount_due_at_signing),
    monthlyPaymentMismatchAcknowledged: hic.monthly_payment_mismatch_acknowledged,
  };
}

// The actual field-editing body of the Send HIC form — shared by
// SendHicSection (appointment panel) and HicFormModal (admin Correct /
// manual-create flows) so this long form only exists in one place.
export function HicFormFields({
  form,
  update,
  financingTypes,
  mismatchWarning,
}: {
  form: HicFormInput;
  update: <K extends keyof HicFormInput>(key: K, value: HicFormInput[K]) => void;
  financingTypes: HicFinancingType[];
  mismatchWarning: boolean;
}) {
  const numberOfPanelsPreview =
    Number(form.systemSizeKw) > 0 ? Math.round((Number(form.systemSizeKw) * 1000) / 450) : null;

  const selectedFinancingKey = financingTypes.find((f) => f.id === form.financingTypeId)?.key ?? null;
  const isLightreach = selectedFinancingKey === "lightreach";
  const isSungageLoan = selectedFinancingKey === "sungage_loan";
  const isCash = selectedFinancingKey === "cash";

  // Starts with the hardcoded fallback lists so the form is usable
  // immediately, then swaps in the admin-editable live lists (Phase 5
  // settings) once they resolve — avoids threading these through every
  // appointment-panel/admin-page call site just for a dropdown.
  const [escalatorOptions, setEscalatorOptions] = useState<number[]>(HIC_ESCALATOR_OPTIONS);
  const [kwhRateOptions, setKwhRateOptions] = useState<number[]>(HIC_KWH_RATE_OPTIONS);
  const [aprOptions, setAprOptions] = useState<number[]>(HIC_APR_OPTIONS);
  const [loanTermOptions, setLoanTermOptions] = useState<number[]>(HIC_LOAN_TERM_OPTIONS);

  useEffect(() => {
    let cancelled = false;
    getHicOptionLists().then((result) => {
      if (cancelled) return;
      setEscalatorOptions(result.escalatorOptions);
      setKwhRateOptions(result.kwhRateOptions);
      setAprOptions(result.aprOptions);
      setLoanTermOptions(result.loanTermOptions);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div className="space-y-2">
        <SectionLabel>Document</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium">Language</label>
            <Select value={form.language} onChange={(e) => update("language", e.target.value as "en" | "es")} className="block w-full">
              <option value="en">English</option>
              <option value="es">Spanish</option>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Financing</label>
            <Select
              value={form.financingTypeId}
              disabled={financingTypes.filter((f) => f.is_enabled).length <= 1}
              onChange={(e) => update("financingTypeId", e.target.value)}
              className="block w-full"
            >
              {financingTypes.map((f) => (
                <option key={f.id} value={f.id} disabled={!f.is_enabled}>
                  {f.label}{!f.is_enabled ? " (Coming soon)" : ""}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <SectionLabel>Customer</SectionLabel>
        <Input value={form.customerName} onChange={(e) => update("customerName", e.target.value)} placeholder="Customer name" className="block w-full" />
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={form.customerPhone}
            onChange={(e) => update("customerPhone", formatPhoneInput(e.target.value))}
            placeholder="999-999-9999"
            className="block w-full"
          />
          <Input
            type="email"
            value={form.customerEmail}
            onChange={(e) => update("customerEmail", e.target.value)}
            placeholder="Customer email"
            className="block w-full"
          />
        </div>
        <label className="flex items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={form.hasCoBorrower}
            onChange={(e) => update("hasCoBorrower", e.target.checked)}
            className="h-4 w-4"
          />
          Has co-borrower
        </label>
        {form.hasCoBorrower && (
          <div className="space-y-2 rounded-md border border-black/10 p-2 dark:border-white/10">
            <Input
              value={form.coBorrowerName}
              onChange={(e) => update("coBorrowerName", e.target.value)}
              placeholder="Co-borrower name"
              className="block w-full"
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={form.coBorrowerPhone}
                onChange={(e) => update("coBorrowerPhone", formatPhoneInput(e.target.value))}
                placeholder="999-999-9999"
                className="block w-full"
              />
              <Input
                type="email"
                value={form.coBorrowerEmail}
                onChange={(e) => update("coBorrowerEmail", e.target.value)}
                placeholder="Co-borrower email"
                className="block w-full"
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <SectionLabel>Installation address</SectionLabel>
        <Input
          value={form.installAddressLine}
          onChange={(e) => update("installAddressLine", e.target.value)}
          placeholder="Street"
          className="block w-full"
        />
        <div className="grid grid-cols-3 gap-2">
          <Input value={form.installCity} onChange={(e) => update("installCity", e.target.value)} placeholder="City" />
          <Input value={form.installState} onChange={(e) => update("installState", e.target.value)} placeholder="State" />
          <Input value={form.installZip} onChange={(e) => update("installZip", e.target.value)} placeholder="ZIP" />
        </div>
      </div>

      <div className="space-y-2">
        <SectionLabel>System &amp; pricing</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium">System size (kW)</label>
            <Input
              type="number"
              step="0.01"
              value={form.systemSizeKw}
              onChange={(e) => update("systemSizeKw", e.target.value)}
              className="block w-full"
            />
            {numberOfPanelsPreview !== null && (
              <p className="text-[11px] text-black/50 dark:text-white/50">
                ≈ {numberOfPanelsPreview} panels (450W) — must divide evenly to send
              </p>
            )}
          </div>
          {(isLightreach || isSungageLoan) && (
            <div className="space-y-1">
              <label className="text-xs font-medium">Est. production, first year (kWh)</label>
              <Input
                type="number"
                step="0.01"
                value={form.estProductionKwh}
                onChange={(e) => update("estProductionKwh", e.target.value)}
                className="block w-full"
              />
              <p className="text-[11px] text-black/50 dark:text-white/50">
                {isLightreach ? "Enter exactly as LightReach shows, including decimals." : "Estimated first-year production for this system."}
              </p>
            </div>
          )}
        </div>

        {(isLightreach || isSungageLoan) && (
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">{isLightreach ? "1st-yr monthly payment" : "Monthly payment"}</label>
              <Input
                type="number"
                step="0.01"
                value={form.firstYearMonthlyPayment}
                onChange={(e) => update("firstYearMonthlyPayment", e.target.value)}
                className="block w-full"
              />
              {isSungageLoan && (
                <p className="text-[11px] text-black/50 dark:text-white/50">From Sungage&apos;s loan quote.</p>
              )}
            </div>
            {isLightreach && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Escalator</label>
                  <Select
                    value={form.escalator}
                    onChange={(e) => update("escalator", Number(e.target.value))}
                    className="block w-full"
                  >
                    {escalatorOptions.map((e) => (
                      <option key={e} value={e}>
                        {(e * 100).toFixed(2)}%
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">kWh rate</label>
                  <Select value={form.kwhRate} onChange={(e) => update("kwhRate", Number(e.target.value))} className="block w-full">
                    {kwhRateOptions.map((r) => (
                      <option key={r} value={r}>
                        ${r.toFixed(3)}
                      </option>
                    ))}
                  </Select>
                </div>
              </>
            )}
          </div>
        )}

        {(isSungageLoan || isCash) && (
          <div className="space-y-1">
            <label className="text-xs font-medium">Contract price</label>
            <Input
              type="number"
              step="0.01"
              value={form.contractPriceManual}
              onChange={(e) => update("contractPriceManual", e.target.value)}
              className="block w-full"
            />
            <p className="text-[11px] text-black/50 dark:text-white/50">
              Total contract price for this {isCash ? "cash" : "loan"} deal — entered manually, not calculated.
            </p>
          </div>
        )}

        {isSungageLoan && (
          <div className="space-y-2 rounded-md border border-black/10 p-2 dark:border-white/10">
            <SectionLabel>Loan details</SectionLabel>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium">Fixed APR</label>
                <Select value={form.fixedApr} onChange={(e) => update("fixedApr", Number(e.target.value))} className="block w-full">
                  {aprOptions.map((a) => (
                    <option key={a} value={a}>
                      {(a * 100).toFixed(2)}%
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Loan term</label>
                <Select value={form.loanTermYears} onChange={(e) => update("loanTermYears", Number(e.target.value))} className="block w-full">
                  {loanTermOptions.map((t) => (
                    <option key={t} value={t}>
                      {t} yr
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Payment after 36 months</label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.paymentAfter36Months}
                  onChange={(e) => update("paymentAfter36Months", e.target.value)}
                  className="block w-full"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {isLightreach && mismatchWarning && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
          LightReach&apos;s first-year payment for these numbers is usually{" "}
          {formatCurrency(
            Math.round(((Number(form.estProductionKwh) * form.kwhRate) / 12) * 100) / 100
          )}{" "}
          — double-check your entry.
          <button
            type="button"
            onClick={() => update("monthlyPaymentMismatchAcknowledged", true)}
            className="ml-2 underline"
          >
            Looks right, continue
          </button>
        </div>
      )}
    </>
  );
}
