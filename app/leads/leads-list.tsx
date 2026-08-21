"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { Disposition, Lead } from "./types";

const DEFAULT_COLOR = "#6B7280";
// Sentinel key for the "no disposition set" group — distinct from any
// real disposition id.
const NO_DISPOSITION_KEY = "__no_disposition__";

// Grouped by disposition, collapsible — mirrors the appointments admin
// list's grouped-by-status pattern (appointments-explorer.tsx) exactly,
// applied to leads/dispositions instead of appointments/statuses.
export function LeadsList({
  leads,
  dispositions,
  dispositionById,
  onSelectLead,
}: {
  leads: Lead[];
  dispositions: Disposition[];
  dispositionById: Map<string, Disposition>;
  onSelectLead: (leadId: string) => void;
}) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  if (leads.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-black/60 dark:text-white/60">
        No leads match these filters.
      </div>
    );
  }

  const groups = dispositions
    .map((d) => ({ id: d.id, name: d.name, color: d.color, leads: leads.filter((l) => l.disposition_id === d.id) }))
    .filter((g) => g.leads.length > 0);
  const noDispositionLeads = leads.filter((l) => !l.disposition_id);
  if (noDispositionLeads.length > 0) {
    groups.push({ id: NO_DISPOSITION_KEY, name: "No Status", color: DEFAULT_COLOR, leads: noDispositionLeads });
  }

  function toggleCollapsed(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4 p-4 md:overflow-x-auto md:p-6">
      {groups.map((group) => {
        const isCollapsed = collapsedIds.has(group.id);
        return (
          <div key={group.id}>
            <button
              onClick={() => toggleCollapsed(group.id)}
              className="mb-2 flex w-full items-center gap-2 text-sm font-medium md:min-w-[720px]"
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: group.color }} />
              {group.name}
              <span className="text-black/40 dark:text-white/40">({group.leads.length})</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className={`ml-auto h-3.5 w-3.5 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25 12 15.75 4.5 8.25" />
              </svg>
            </button>
            {!isCollapsed && (
              <>
                {/* Mobile: stacked cards — a horizontally-scrolling table
                    is a real usability problem on a phone, not just a
                    cosmetic one, so this isn't the same table squeezed
                    smaller, it's a different layout entirely below md. */}
                <div className="space-y-2 md:hidden">
                  {group.leads.map((lead) => {
                    const disposition = lead.disposition_id ? dispositionById.get(lead.disposition_id) : undefined;
                    return (
                      <button
                        key={lead.id}
                        onClick={() => onSelectLead(lead.id)}
                        className="flex w-full flex-col gap-1 rounded-xl border border-black/10 p-3 text-left transition-colors active:bg-black/5 dark:border-white/10 dark:active:bg-white/10"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium">
                            {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—"}
                            {lead.is_manual && (
                              <Badge className="ml-2 text-[10px] uppercase tracking-wide">Manual</Badge>
                            )}
                          </span>
                          <Badge color={disposition?.color ?? DEFAULT_COLOR} className="shrink-0">
                            {disposition?.name ?? "—"}
                          </Badge>
                        </div>
                        <span className="text-sm text-black/60 dark:text-white/60">
                          {lead.address_line}, {lead.zipcode}
                          {lead.lat == null && (
                            <span className="ml-1 text-black/40 dark:text-white/40">(no location)</span>
                          )}
                        </span>
                        <span className="text-xs text-black/40 dark:text-white/40">
                          Added {new Date(lead.created_at).toLocaleDateString()}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Desktop: the full table, unchanged. table-fixed +
                    explicit column widths, identical across every group's
                    table — plain table-layout: auto (the default) sizes
                    each <table>'s columns independently based on only
                    that group's own content, so "Address" (etc.) would
                    land at a different width in every group and drift
                    out of alignment scrolling down the page. Widths below
                    are shared by every group, so columns always line up. */}
                <div className="hidden w-full min-w-[720px] overflow-hidden rounded-xl border border-black/10 dark:border-white/10 md:block">
                  <table className="w-full table-fixed text-left text-sm">
                    <colgroup>
                      <col className="w-[20%]" />
                      <col className="w-[32%]" />
                      <col className="w-[10%]" />
                      <col className="w-[20%]" />
                      <col className="w-[18%]" />
                    </colgroup>
                    <thead className="bg-black/5 dark:bg-white/5">
                      <tr>
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Address</th>
                        <th className="px-3 py-2 font-medium">Zip</th>
                        <th className="px-3 py-2 font-medium">Disposition</th>
                        <th className="px-3 py-2 font-medium">Added</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.leads.map((lead) => {
                        const disposition = lead.disposition_id ? dispositionById.get(lead.disposition_id) : undefined;
                        return (
                          <tr
                            key={lead.id}
                            onClick={() => onSelectLead(lead.id)}
                            className="cursor-pointer border-t border-black/5 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
                          >
                            <td className="px-3 py-2">
                              {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—"}
                              {lead.is_manual && (
                                <Badge className="ml-2 text-[10px] uppercase tracking-wide">Manual</Badge>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {lead.address_line}
                              {lead.lat == null && (
                                <span className="ml-2 text-xs text-black/40 dark:text-white/40">(no location)</span>
                              )}
                            </td>
                            <td className="px-3 py-2">{lead.zipcode}</td>
                            <td className="px-3 py-2">
                              <Badge color={disposition?.color ?? DEFAULT_COLOR}>{disposition?.name ?? "—"}</Badge>
                            </td>
                            <td className="px-3 py-2">{new Date(lead.created_at).toLocaleDateString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
