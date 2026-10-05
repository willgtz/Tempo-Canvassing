"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { sendHic } from "./actions";
import { formatCurrency, formatKw, formatKwh, formatPercent } from "@/lib/hic/format";
import type { Hic } from "./types";

// Send is only ever available from this screen, per spec — the form
// screen itself never has a Send button.
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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Review &amp; Send</p>
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
        >
          Back to form
        </button>
      </div>

      {/* TODO Phase 2: this becomes a full live preview of the filled
          document package (every page of every document) once real PDF
          generation exists — Phase 1 only has the underlying numbers to
          show. */}
      <div className="space-y-1.5 rounded-md border border-black/10 p-3 text-sm dark:border-white/10">
        <div className="flex justify-between">
          <span className="text-black/60 dark:text-white/60">Customer</span>
          <span>{hic.customer_name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-black/60 dark:text-white/60">Language</span>
          <span>{hic.language === "en" ? "English" : "Spanish"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-black/60 dark:text-white/60">System size</span>
          <span>{formatKw(hic.system_size_kw)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-black/60 dark:text-white/60">Panels</span>
          <span>
            {hic.number_of_panels} × {hic.panel_brand}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-black/60 dark:text-white/60">Est. production</span>
          <span>{formatKwh(hic.est_production_kwh)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-black/60 dark:text-white/60">kWh rate</span>
          <span>${hic.kwh_rate.toFixed(3)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-black/60 dark:text-white/60">Escalator</span>
          <span>{formatPercent(hic.escalator)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-black/60 dark:text-white/60">1st-yr monthly payment</span>
          <span>{formatCurrency(hic.first_year_monthly_payment)}</span>
        </div>
        <div className="flex justify-between font-medium">
          <span>Contract price</span>
          <span>{hic.contract_price != null ? formatCurrency(hic.contract_price) : "—"}</span>
        </div>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <Button type="button" disabled={isSending} onClick={handleSend} className="w-full">
        {isSending ? "Sending…" : "Send"}
      </Button>
    </div>
  );
}
