"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { HicFormModal } from "@/app/appointments/send-hic/hic-form-modal";
import { archiveHic, unarchiveHic } from "@/app/appointments/send-hic/actions";
import type { Hic, HicFinancingType, HicStatus } from "@/app/appointments/send-hic/types";

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

export function AllHicsExplorer({
  hics,
  profiles,
  financingTypes,
  mode = "active",
}: {
  hics: Hic[];
  profiles: { id: string; full_name: string }[];
  financingTypes: HicFinancingType[];
  mode?: "active" | "archived";
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState("all");
  const [repFilter, setRepFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedSearchQuery, setAppliedSearchQuery] = useState("");
  const [showSendModal, setShowSendModal] = useState(false);
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const [unarchivedIds, setUnarchivedIds] = useState<Set<string>>(new Set());
  const [rowError, setRowError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasEnabledFinancingType = financingTypes.some((f) => f.is_enabled);

  const repNameById = useMemo(() => new Map(profiles.map((p) => [p.id, p.full_name])), [profiles]);

  const filteredHics = useMemo(() => {
    const search = appliedSearchQuery.trim().toLowerCase();
    return hics.filter((hic) => {
      // Optimistic local overrides so a just-archived/unarchived row
      // disappears from this view immediately, without waiting on the
      // server revalidation round trip.
      const isArchived = archivedIds.has(hic.id) ? true : unarchivedIds.has(hic.id) ? false : !!hic.archived_at;
      if (mode === "active" && isArchived) return false;
      if (mode === "archived" && !isArchived) return false;

      if (statusFilter !== "all" && hic.status !== statusFilter) return false;
      // sales_rep_id (who countersigns/the deal is attributed to), not
      // created_by (who literally clicked Send) — these diverge once an
      // admin sends a HIC on behalf of a different rep.
      if (repFilter !== "all" && hic.sales_rep_id !== repFilter) return false;

      const createdDate = hic.created_at.slice(0, 10);
      if (dateFrom && createdDate < dateFrom) return false;
      if (dateTo && createdDate > dateTo) return false;

      if (search && !hic.customer_name.toLowerCase().includes(search)) return false;

      return true;
    });
  }, [hics, mode, archivedIds, unarchivedIds, statusFilter, repFilter, dateFrom, dateTo, appliedSearchQuery]);

  function handleArchive(hicId: string) {
    setRowError(null);
    setPendingId(hicId);
    startTransition(async () => {
      const result = await archiveHic(hicId);
      if (!result.ok) setRowError(result.error);
      else setArchivedIds((prev) => new Set(prev).add(hicId));
    });
  }

  function handleUnarchive(hicId: string) {
    setRowError(null);
    setPendingId(hicId);
    startTransition(async () => {
      const result = await unarchiveHic(hicId);
      if (!result.ok) setRowError(result.error);
      else setUnarchivedIds((prev) => new Set(prev).add(hicId));
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{mode === "archived" ? "Archived HICs" : "HICs"}</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            {mode === "archived"
              ? "Archived HICs — hidden from the main list, but still here if you need them."
              : "Every Home Improvement Contract, any rep, any status. Click a row for the full timeline."}
          </p>
        </div>
        {mode === "active" && hasEnabledFinancingType && (
          <Button type="button" size="sm" onClick={() => setShowSendModal(true)} className="shrink-0">
            Send HIC
          </Button>
        )}
      </div>

      {rowError && <p className="text-sm text-red-600 dark:text-red-400">{rowError}</p>}

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 p-3 dark:border-white/10">
        <div className="space-y-1">
          <label className="text-xs font-medium">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="block rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          >
            <option value="all">All</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium">Rep</label>
          <select
            value={repFilter}
            onChange={(e) => setRepFilter(e.target.value)}
            className="block rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          >
            <option value="all">All reps</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium">Created from</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="block rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Created to</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="block rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium">Search customer name</label>
          <div className="flex gap-1">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setAppliedSearchQuery(searchQuery);
              }}
              placeholder="Name"
              className="rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
            />
            <button
              type="button"
              onClick={() => setAppliedSearchQuery(searchQuery)}
              className="rounded border border-black/15 px-2 py-1 text-xs dark:border-white/20"
            >
              Search
            </button>
          </div>
        </div>

        <span className="ml-auto text-sm text-black/60 dark:text-white/60">
          {filteredHics.length} HIC{filteredHics.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Rep</th>
              <th className="px-3 py-2 font-medium">Language</th>
              <th className="px-3 py-2 font-medium">Created</th>
              <th className="px-3 py-2 font-medium">Sent</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filteredHics.map((hic) => (
              <tr key={hic.id} className="border-t border-black/5 hover:bg-black/[0.02] dark:border-white/10 dark:hover:bg-white/[0.03]">
                <td className="px-3 py-2">
                  <Link href={`/admin/hics/${hic.id}`} className="underline decoration-black/30 underline-offset-2 hover:decoration-black dark:decoration-white/30 dark:hover:decoration-white">
                    {hic.customer_name}
                  </Link>
                  {hic.has_co_borrower && <span className="ml-1 text-xs text-black/40 dark:text-white/40">+1</span>}
                </td>
                <td className="px-3 py-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_COLOR[hic.status])}>
                    {STATUS_LABEL[hic.status]}
                  </span>
                </td>
                <td className="px-3 py-2">{repNameById.get(hic.sales_rep_id) ?? hic.sales_rep_name}</td>
                <td className="px-3 py-2">{hic.language === "en" ? "English" : "Spanish"}</td>
                <td className="px-3 py-2">{new Date(hic.created_at).toLocaleDateString()}</td>
                <td className="px-3 py-2">{hic.sent_at ? new Date(hic.sent_at).toLocaleDateString() : "—"}</td>
                <td className="px-3 py-2 text-right">
                  {mode === "active" ? (
                    <button
                      type="button"
                      onClick={() => handleArchive(hic.id)}
                      disabled={isPending}
                      className="text-xs text-black/50 underline hover:text-black disabled:opacity-50 dark:text-white/50 dark:hover:text-white"
                    >
                      {isPending && pendingId === hic.id ? "Archiving…" : "Archive"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleUnarchive(hic.id)}
                      disabled={isPending}
                      className="text-xs text-black/50 underline hover:text-black disabled:opacity-50 dark:text-white/50 dark:hover:text-white"
                    >
                      {isPending && pendingId === hic.id ? "Unarchiving…" : "Unarchive"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filteredHics.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm italic text-black/40 dark:text-white/40">
                  {mode === "archived" ? "No archived HICs." : "No HICs match these filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showSendModal && (
        <HicFormModal
          initialHic={null}
          financingTypes={financingTypes}
          title="Send HIC"
          isAdmin
          onClose={() => setShowSendModal(false)}
          onSent={(sentHic) => {
            setShowSendModal(false);
            router.push(`/admin/hics/${sentHic.id}`);
          }}
        />
      )}
    </div>
  );
}
