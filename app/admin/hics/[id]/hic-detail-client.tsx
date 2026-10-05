"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import { cn } from "@/components/ui/cn";
import { archiveHic, correctHic, getHicDownloadUrl, resendHic, unarchiveHic, voidHic } from "@/app/appointments/send-hic/actions";
import { HicFormModal } from "../hic-form-modal";
import { formatCurrency, formatKw, formatKwh, formatPercent } from "@/lib/hic/format";
import type { Hic, HicFinancingType, HicStatus, HicSigner } from "@/app/appointments/send-hic/types";
import type { ContractPriceYear } from "@/lib/hic/contract-price";
import type { HicEvent } from "./page";

const STATUS_LABEL: Record<HicStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  partially_signed: "Partially signed",
  signed: "Signed",
  declined: "Declined",
  expired: "Expired",
  voided: "Voided",
};

const STATUS_COLOR: Record<HicStatus, string> = {
  draft: "bg-black/10 text-black/70 dark:bg-white/10 dark:text-white/70",
  sent: "bg-blue-600/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  viewed: "bg-blue-600/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  partially_signed: "bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  signed: "bg-green-600/10 text-green-700 dark:bg-green-500/20 dark:text-green-300",
  declined: "bg-red-600/10 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  expired: "bg-black/10 text-black/50 dark:bg-white/10 dark:text-white/50",
  voided: "bg-black/10 text-black/50 dark:bg-white/10 dark:text-white/50",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">{children}</p>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-black/60 dark:text-white/60">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function timestamp(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
}

export function HicDetailClient({
  hic,
  signers,
  events,
  schedule,
  financingTypes,
}: {
  hic: Hic;
  signers: HicSigner[];
  events: HicEvent[];
  schedule: ContractPriceYear[];
  financingTypes: HicFinancingType[];
}) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<"download" | "resend" | "correct" | "void" | "archive" | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [correctingHic, setCorrectingHic] = useState<Hic | null>(null);

  const canResend = ["sent", "viewed", "partially_signed"].includes(hic.status);
  const canVoid = hic.status !== "voided";
  const canCorrect = hic.status !== "draft" && !hic.corrected_into_hic_id;

  const lastResentAt = events.find((e) => e.event_type === "resent")?.occurred_at ?? null;

  function handleResend() {
    setActionError(null);
    setActionNotice(null);
    setPendingAction("resend");
    startTransition(async () => {
      const result = await resendHic(hic.id);
      if (!result.ok) setActionError(result.error);
      else {
        setActionNotice(`Resent ${timestamp(new Date().toISOString())}.`);
        router.refresh();
      }
    });
  }

  function handleVoid() {
    const reason = window.prompt("Reason for voiding this HIC (optional — leave blank and press OK to void without one):");
    // Cancel on the prompt itself (not just an empty reason) aborts —
    // previously this fell through to a second, confusing confirm
    // dialog instead of just stopping.
    if (reason === null) return;
    setActionError(null);
    setActionNotice(null);
    setPendingAction("void");
    startTransition(async () => {
      const result = await voidHic(hic.id, reason.trim() || undefined);
      if (!result.ok) setActionError(result.error);
      else {
        setActionNotice("Voided.");
        router.refresh();
      }
    });
  }

  function handleCorrect() {
    setActionError(null);
    setActionNotice(null);
    setPendingAction("correct");
    startTransition(async () => {
      const result = await correctHic(hic.id);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      setCorrectingHic(result.hic);
    });
  }

  function handleArchiveToggle() {
    setActionError(null);
    setActionNotice(null);
    setPendingAction("archive");
    startTransition(async () => {
      const result = hic.archived_at ? await unarchiveHic(hic.id) : await archiveHic(hic.id);
      if (!result.ok) setActionError(result.error);
      else {
        setActionNotice(hic.archived_at ? "Unarchived." : "Archived.");
        router.refresh();
      }
    });
  }

  function handleDownload() {
    setActionError(null);
    setPendingAction("download");
    startTransition(async () => {
      const result = await getHicDownloadUrl(hic.id);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link href="/admin/hics" className="text-xs text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white">
            ← All HICs
          </Link>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-xl font-semibold">{hic.customer_name}</h1>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_COLOR[hic.status])}>
              {STATUS_LABEL[hic.status]}
            </span>
            {hic.archived_at && (
              <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs font-medium text-black/60 dark:bg-white/10 dark:text-white/60">
                Archived
              </span>
            )}
          </div>
          {hic.original_hic_id && (
            <p className="mt-1 text-xs text-black/50 dark:text-white/50">
              Correction of{" "}
              <Link href={`/admin/hics/${hic.original_hic_id}`} className="underline">
                this HIC
              </Link>
            </p>
          )}
          {hic.corrected_into_hic_id && (
            <p className="mt-1 text-xs text-black/50 dark:text-white/50">
              Corrected by{" "}
              <Link href={`/admin/hics/${hic.corrected_into_hic_id}`} className="underline">
                a newer HIC
              </Link>
            </p>
          )}
        </div>
      </div>

      {actionError && <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}
      {actionNotice && !actionError && <p className="text-sm text-green-600 dark:text-green-400">{actionNotice}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleDownload}
          disabled={isPending}
          className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
        >
          {isPending && pendingAction === "download" ? "Opening…" : "Download"}
        </button>
        {canResend && (
          <button
            type="button"
            onClick={handleResend}
            disabled={isPending}
            className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
          >
            {isPending && pendingAction === "resend" ? "Resending…" : "Resend"}
          </button>
        )}
        {canCorrect && (
          <button
            type="button"
            onClick={handleCorrect}
            disabled={isPending}
            className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
          >
            {isPending && pendingAction === "correct" ? "Preparing…" : "Correct"}
          </button>
        )}
        {canVoid && (
          <button
            type="button"
            onClick={handleVoid}
            disabled={isPending}
            className="rounded-full border border-red-600/30 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-600/5 disabled:opacity-50 dark:border-red-400/30 dark:text-red-400 dark:hover:bg-red-400/10"
          >
            {isPending && pendingAction === "void" ? "Voiding…" : "Void"}
          </button>
        )}
        <button
          type="button"
          onClick={handleArchiveToggle}
          disabled={isPending}
          className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
        >
          {isPending && pendingAction === "archive"
            ? hic.archived_at ? "Unarchiving…" : "Archiving…"
            : hic.archived_at ? "Unarchive" : "Archive"}
        </button>
      </div>
      {lastResentAt && (
        <p className="text-xs text-black/50 dark:text-white/50">Last resent: {timestamp(lastResentAt)}</p>
      )}

      <div className="space-y-1.5 rounded-md border border-black/10 p-3 dark:border-white/10">
        <SectionLabel>Signers</SectionLabel>
        {signers.map((s) => (
          <div key={s.id} className="flex items-center justify-between text-sm">
            <span>
              {s.full_name} <span className="text-black/50 dark:text-white/50">({s.role === "homeowner" ? "Homeowner" : "Co-Borrower"})</span>
            </span>
            <span className="text-black/60 dark:text-white/60">{s.status}</span>
          </div>
        ))}
      </div>

      <div className="space-y-1.5 rounded-md border border-black/10 p-3 dark:border-white/10">
        <SectionLabel>System &amp; pricing</SectionLabel>
        <Row label="System size" value={formatKw(hic.system_size_kw)} />
        <Row label="Panels" value={`${hic.number_of_panels} × ${hic.panel_brand}`} />
        <Row label="Est. first-year production" value={formatKwh(hic.est_production_kwh)} />
        <Row label="kWh rate" value={`$${hic.kwh_rate.toFixed(3)}`} />
        <Row label="Escalator" value={formatPercent(hic.escalator)} />
        <Row label="1st-year monthly payment" value={formatCurrency(hic.first_year_monthly_payment)} />
        <div className="mt-2 flex items-baseline justify-between border-t border-black/10 pt-2 dark:border-white/10">
          <span className="text-sm font-medium">Contract price (25-year total)</span>
          <span className="text-xl font-semibold">{hic.contract_price != null ? formatCurrency(hic.contract_price) : "—"}</span>
        </div>
        <button
          type="button"
          onClick={() => setShowSchedule((v) => !v)}
          className="mt-2 text-xs underline text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
        >
          {showSchedule ? "Hide" : "Show"} 25-year schedule
        </button>
        {showSchedule && (
          <div className="mt-2 max-h-64 overflow-y-auto rounded border border-black/10 dark:border-white/10">
            <table className="w-full text-left text-xs">
              <thead className="bg-black/5 dark:bg-white/5">
                <tr>
                  <th className="px-2 py-1 font-medium">Year</th>
                  <th className="px-2 py-1 font-medium">Rate</th>
                  <th className="px-2 py-1 font-medium">Production (kWh)</th>
                  <th className="px-2 py-1 font-medium">Monthly</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((row) => (
                  <tr key={row.year} className="border-t border-black/5 dark:border-white/10">
                    <td className="px-2 py-1">{row.year}</td>
                    <td className="px-2 py-1">${row.rate.toFixed(4)}</td>
                    <td className="px-2 py-1">{row.production.toFixed(2)}</td>
                    <td className="px-2 py-1">{formatCurrency(row.monthlyPayment)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-2 rounded-md border border-black/10 p-3 dark:border-white/10">
        <SectionLabel>Timeline</SectionLabel>
        <ul className="space-y-1.5">
          {events.map((e) => (
            <li key={e.id} className="text-sm">
              <span className="text-black/50 dark:text-white/50">{timestamp(e.occurred_at)}</span> — {e.event_type.replace(/_/g, " ")}
              {e.new_value && <span className="text-black/50 dark:text-white/50"> ({e.new_value})</span>}
            </li>
          ))}
          {events.length === 0 && <p className="text-sm italic text-black/40 dark:text-white/40">No events yet.</p>}
        </ul>
      </div>

      {correctingHic && (
        <HicFormModal
          initialHic={correctingHic}
          financingTypes={financingTypes}
          title="Correct HIC"
          onClose={() => setCorrectingHic(null)}
          onSent={() => {
            setCorrectingHic(null);
            setActionNotice("Correction sent — the original was voided.");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
