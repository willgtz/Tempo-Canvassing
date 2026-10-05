"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { generateHicPreview, sendHic } from "./actions";
import { PackagePreview } from "./package-preview";
import { formatCurrency, formatKw, formatKwh, formatPercent } from "@/lib/hic/format";
import type { Hic } from "./types";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
      {children}
    </p>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-black/60 dark:text-white/60">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

// Send is only ever available from this screen, per spec — the form
// screen itself never has a Send button. Grouped into the same
// Customer/Address/System sections the form itself uses, so what's
// being reviewed reads as "exactly what I just filled in," not a flat
// undifferentiated list.
export function HicReviewScreen({
  hic,
  onBack,
  onSent,
}: {
  hic: Hic;
  onBack: () => void;
  onSent: (hic: Hic) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isSending, startSending] = useTransition();

  const [preview, setPreview] = useState<{ url: string; pageCount: number } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(true);

  // Generates the real filled package once, as soon as the review
  // screen opens — exactly what Send will produce, not a mockup.
  useEffect(() => {
    let cancelled = false;
    generateHicPreview(hic.id).then((result) => {
      if (cancelled) return;
      if (result.ok) setPreview({ url: result.url, pageCount: result.pageCount });
      else setPreviewError(result.error);
      setIsLoadingPreview(false);
    });
    return () => {
      cancelled = true;
    };
  }, [hic.id]);

  function handleSend() {
    setError(null);
    startSending(async () => {
      const result = await sendHic(hic.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSent({ ...hic, status: "sent", sent_at: new Date().toISOString() });
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-black/60 dark:text-white/60">
        This is what will be generated and sent to <span className="font-medium">{hic.customer_name}</span>{" "}
        for signature{hic.has_co_borrower ? " (and the co-borrower)" : ""}. Double-check it before sending —
        a sent HIC can&apos;t be edited directly.
      </p>

      <div className="space-y-1.5 rounded-md border border-black/10 p-3 dark:border-white/10">
        <SectionLabel>Document</SectionLabel>
        <Row label="Language" value={hic.language === "en" ? "English" : "Spanish"} />
      </div>

      <div className="space-y-1.5 rounded-md border border-black/10 p-3 dark:border-white/10">
        <SectionLabel>Customer</SectionLabel>
        <Row label="Name" value={hic.customer_name} />
        <Row label="Phone" value={hic.customer_phone} />
        <Row label="Email" value={hic.customer_email} />
        {hic.has_co_borrower && (
          <>
            <div className="mt-2 border-t border-black/10 pt-2 dark:border-white/10">
              <SectionLabel>Co-borrower</SectionLabel>
            </div>
            <Row label="Name" value={hic.co_borrower_name ?? "—"} />
            <Row label="Phone" value={hic.co_borrower_phone ?? "—"} />
            <Row label="Email" value={hic.co_borrower_email ?? "—"} />
          </>
        )}
      </div>

      <div className="space-y-1.5 rounded-md border border-black/10 p-3 dark:border-white/10">
        <SectionLabel>Installation address</SectionLabel>
        <p className="text-sm">
          {hic.install_address_line}
          <br />
          {hic.install_city}, {hic.install_state} {hic.install_zip}
        </p>
      </div>

      <div className="space-y-1.5 rounded-md border border-black/10 p-3 dark:border-white/10">
        <SectionLabel>System</SectionLabel>
        <Row label="System size" value={formatKw(hic.system_size_kw)} />
        <Row label="Panels" value={`${hic.number_of_panels} × ${hic.panel_brand}`} />
        <Row label="Est. first-year production" value={formatKwh(hic.est_production_kwh)} />
        <Row label="kWh rate" value={`$${hic.kwh_rate.toFixed(3)}`} />
        <Row label="Escalator" value={formatPercent(hic.escalator)} />
      </div>

      <div className="space-y-1.5 rounded-md border border-black/10 p-3 dark:border-white/10">
        <SectionLabel>Pricing</SectionLabel>
        <Row label="1st-year monthly payment" value={formatCurrency(hic.first_year_monthly_payment)} />
        <Row label="Estimated tax credit" value={formatCurrency(hic.estimated_tax_credit)} />
        <Row label="Amount due at signing" value={formatCurrency(hic.amount_due_at_signing)} />
        <div className="mt-2 flex items-baseline justify-between border-t border-black/10 pt-2 dark:border-white/10">
          <span className="text-sm font-medium">Contract price (25-year total)</span>
          <span className="text-xl font-semibold">
            {hic.contract_price != null ? formatCurrency(hic.contract_price) : "—"}
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        <SectionLabel>Document preview</SectionLabel>
        {isLoadingPreview && <p className="text-sm text-black/50 dark:text-white/50">Generating preview…</p>}
        {previewError && (
          <p className="text-xs text-red-600 dark:text-red-400">Couldn&apos;t generate a preview: {previewError}</p>
        )}
        {preview && <PackagePreview url={preview.url} pageCount={preview.pageCount} />}
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-2 border-t border-black/10 pt-3 dark:border-white/10">
        <Button type="button" variant="secondary" size="sm" onClick={onBack} disabled={isSending} className="flex-1">
          Back to form
        </Button>
        <Button type="button" disabled={isSending} onClick={handleSend} className="flex-1">
          {isSending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
