"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { deleteLead, deleteLeads } from "./actions";
import { LeadEditPanel } from "./lead-edit-panel";
import type { AdminLead, Disposition } from "./types";

const DEFAULT_COLOR = "#6B7280";
type SourceFilter = "all" | "manual" | "batch";

export function AllLeadsExplorer({
  leads,
  dispositions,
}: {
  leads: AdminLead[];
  dispositions: Disposition[];
}) {
  const [leadsState, setLeadsState] = useState(leads);
  const [dispositionFilter, setDispositionFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [zipQuery, setZipQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedSearchQuery, setAppliedSearchQuery] = useState("");
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDeleting] = useTransition();
  const selectAllRef = useRef<HTMLInputElement>(null);

  const dispositionById = useMemo(
    () => new Map(dispositions.map((d) => [d.id, d])),
    [dispositions]
  );

  const filteredLeads = useMemo(() => {
    const zip = zipQuery.trim();
    const search = appliedSearchQuery.trim().toLowerCase();

    return leadsState.filter((lead) => {
      if (dispositionFilter !== "all" && lead.disposition_id !== dispositionFilter) return false;
      if (sourceFilter === "manual" && !lead.is_manual) return false;
      if (sourceFilter === "batch" && lead.is_manual) return false;
      if (zip && !lead.zipcode.includes(zip)) return false;

      const leadDate = lead.created_at.slice(0, 10);
      if (dateFrom && leadDate < dateFrom) return false;
      if (dateTo && leadDate > dateTo) return false;

      if (search) {
        const haystack = [
          lead.first_name,
          lead.last_name,
          lead.address_line,
          lead.city,
          lead.email,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }

      return true;
    });
  }, [leadsState, dispositionFilter, sourceFilter, zipQuery, dateFrom, dateTo, appliedSearchQuery]);

  const editingLead = editingLeadId ? (leadsState.find((l) => l.id === editingLeadId) ?? null) : null;

  const allFilteredSelected =
    filteredLeads.length > 0 && filteredLeads.every((l) => selectedIds.has(l.id));
  const someFilteredSelected = filteredLeads.some((l) => selectedIds.has(l.id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someFilteredSelected && !allFilteredSelected;
    }
  }, [someFilteredSelected, allFilteredSelected]);

  function handleClearFilters() {
    setDispositionFilter("all");
    setSourceFilter("all");
    setZipQuery("");
    setDateFrom("");
    setDateTo("");
    setSearchQuery("");
    setAppliedSearchQuery("");
  }

  function toggleLead(leadId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const l of filteredLeads) next.delete(l.id);
      } else {
        for (const l of filteredLeads) next.add(l.id);
      }
      return next;
    });
  }

  function handleDelete(lead: AdminLead) {
    const ok = confirm(`Delete the lead at "${lead.address_line}"? This can't be undone.`);
    if (!ok) return;

    setDeleteError(null);
    startDeleting(async () => {
      const result = await deleteLead(lead.id);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      setLeadsState((prev) => prev.filter((l) => l.id !== lead.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(lead.id);
        return next;
      });
    });
  }

  function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const ok = confirm(
      `Delete ${ids.length} lead${ids.length === 1 ? "" : "s"}? This can't be undone.`
    );
    if (!ok) return;

    setDeleteError(null);
    startDeleting(async () => {
      const result = await deleteLeads(ids);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      const deletedSet = new Set(ids);
      setLeadsState((prev) => prev.filter((l) => !deletedSet.has(l.id)));
      setSelectedIds(new Set());
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">All Leads</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Every lead regardless of source. Click a row to edit any field —
          changing the address re-geocodes it automatically. Delete is
          permanent.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 p-3 dark:border-white/10">
        <div className="space-y-1">
          <label className="text-xs font-medium">Disposition</label>
          <select
            value={dispositionFilter}
            onChange={(e) => setDispositionFilter(e.target.value)}
            className="block rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          >
            <option value="all">All</option>
            {dispositions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium">Source</label>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
            className="block rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          >
            <option value="all">All</option>
            <option value="batch">CSV batches</option>
            <option value="manual">Manually entered</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium">Zip</label>
          <input
            value={zipQuery}
            onChange={(e) => setZipQuery(e.target.value)}
            placeholder="Any zip"
            className="w-24 rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="block rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="block rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium">Search</label>
          <div className="flex gap-1">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setAppliedSearchQuery(searchQuery);
                }
              }}
              placeholder="Name, address, email"
              className="rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
            />
            <button
              type="button"
              onClick={() => setAppliedSearchQuery(searchQuery)}
              className="rounded border border-black/15 px-3 py-1 text-sm dark:border-white/20"
            >
              Search
            </button>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleClearFilters}
            className="rounded border border-black/15 px-3 py-1 text-sm dark:border-white/20"
          >
            Clear filters
          </button>
          <span className="text-sm text-black/60 dark:text-white/60">
            {filteredLeads.length} lead{filteredLeads.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-black/10 bg-black/5 p-3 dark:border-white/10 dark:bg-white/5">
          <span className="text-sm">
            {selectedIds.size} selected
          </span>
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={isDeleting}
            className="rounded border border-red-300 px-3 py-1 text-sm text-red-600 disabled:opacity-50 dark:border-red-800 dark:text-red-400"
          >
            {isDeleting ? "Deleting…" : "Delete Selected"}
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="rounded border border-black/15 px-3 py-1 text-sm dark:border-white/20"
          >
            Clear selection
          </button>
        </div>
      )}

      {deleteError && (
        <p className="text-sm text-red-600 dark:text-red-400">Delete failed: {deleteError}</p>
      )}

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full min-w-[840px] text-left text-sm">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr>
              <th className="w-8 px-3 py-2">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all filtered leads"
                />
              </th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Address</th>
              <th className="px-3 py-2 font-medium">Zip</th>
              <th className="px-3 py-2 font-medium">Disposition</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Added</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLeads.map((lead) => {
              const disposition = lead.disposition_id ? dispositionById.get(lead.disposition_id) : undefined;
              return (
                <tr key={lead.id} className="border-t border-black/5 dark:border-white/10">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(lead.id)}
                      onChange={() => toggleLead(lead.id)}
                      aria-label={`Select ${lead.address_line}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-3 py-2">
                    {lead.address_line}
                    {lead.lat == null && (
                      <span className="ml-2 text-xs text-black/40 dark:text-white/40">
                        (no location)
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{lead.zipcode}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block h-3 w-3 rounded-full border border-black/10 dark:border-white/20"
                        style={{ backgroundColor: disposition?.color ?? DEFAULT_COLOR }}
                      />
                      {disposition?.name ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {lead.is_manual ? "Manual" : (lead.batch_filename ?? "—")}
                  </td>
                  <td className="px-3 py-2">{new Date(lead.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingLeadId(lead.id)}
                        className="rounded border border-black/15 px-2 py-1 text-xs dark:border-white/20"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(lead)}
                        disabled={isDeleting}
                        className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 disabled:opacity-50 dark:border-red-800 dark:text-red-400"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredLeads.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-black/50 dark:text-white/50" colSpan={8}>
                  No leads match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingLead && (
        <LeadEditPanel
          key={editingLead.id}
          lead={editingLead}
          dispositions={dispositions}
          onClose={() => setEditingLeadId(null)}
          onSaved={(updated) => {
            setLeadsState((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
            setEditingLeadId(null);
          }}
        />
      )}
    </div>
  );
}
