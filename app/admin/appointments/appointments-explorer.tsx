"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppointmentDetailPanel } from "./appointment-detail-panel";
import { AppointmentsCalendar } from "./appointments-calendar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/components/ui/cn";
import type {
  ActiveProfile,
  Appointment,
  AppointmentAssignment,
  AppointmentLead,
  AppointmentNote,
  AppointmentStatus,
} from "./types";
import type { AppointmentFormField } from "@/app/leads/types";

// Grouped-by-status list, same idea as iOS's AppointmentsListView (List
// mode) — one section per status, ordered by each status's own sort_order.
export function AppointmentsExplorer({
  initialAppointments,
  statuses,
  formFields,
  leads,
  initialAssignments,
  initialNotes,
  activeProfiles,
  sectionOrder,
}: {
  initialAppointments: Appointment[];
  statuses: AppointmentStatus[];
  formFields: AppointmentFormField[];
  leads: AppointmentLead[];
  initialAssignments: AppointmentAssignment[];
  initialNotes: AppointmentNote[];
  activeProfiles: ActiveProfile[];
  sectionOrder: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [appointments, setAppointments] = useState(initialAppointments);
  const [assignments, setAssignments] = useState(initialAssignments);
  const [notes, setNotes] = useState(initialNotes);
  const [leadsState, setLeadsState] = useState(leads);
  const [isRefreshing, startRefresh] = useTransition();
  // Supports deep-linking from a notification ("View appointment") via
  // /admin/appointments?appointment=<id> — see notifications-list.tsx.
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("appointment"));
  const [searchText, setSearchText] = useState("");
  const [selectedStatusIds, setSelectedStatusIds] = useState<Set<string>>(new Set());
  const [scheduledFrom, setScheduledFrom] = useState("");
  const [scheduledTo, setScheduledTo] = useState("");
  const [selectedCloserId, setSelectedCloserId] = useState("");
  const [collapsedStatusIds, setCollapsedStatusIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"list" | "calendar">("calendar");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  // router.refresh() re-runs page.tsx's server-side fetch and passes fresh
  // props down, but doesn't remount this component — its useState wouldn't
  // pick up the new data on its own without adjusting it here. This is
  // React's recommended "adjust state during render" idiom for exactly this
  // case (https://react.dev/learn/you-might-not-need-an-effect) rather than
  // a useEffect, which the lint config here specifically flags — doing it
  // in an effect would mean an extra unnecessary render each time.
  // (statuses/formFields/activeProfiles are read straight from props
  // elsewhere below, so they don't need this.)
  const [prevInitialAppointments, setPrevInitialAppointments] = useState(initialAppointments);
  if (initialAppointments !== prevInitialAppointments) {
    setPrevInitialAppointments(initialAppointments);
    setAppointments(initialAppointments);
  }
  const [prevInitialAssignments, setPrevInitialAssignments] = useState(initialAssignments);
  if (initialAssignments !== prevInitialAssignments) {
    setPrevInitialAssignments(initialAssignments);
    setAssignments(initialAssignments);
  }
  const [prevInitialNotes, setPrevInitialNotes] = useState(initialNotes);
  if (initialNotes !== prevInitialNotes) {
    setPrevInitialNotes(initialNotes);
    setNotes(initialNotes);
  }
  const [prevLeads, setPrevLeads] = useState(leads);
  if (leads !== prevLeads) {
    setPrevLeads(leads);
    setLeadsState(leads);
  }

  const leadById = new Map(leadsState.map((l) => [l.id, l]));

  // Deduped closer list, derived from loaded assignments — same "no
  // separate lookup table" approach as the closer names already shown in
  // the list table below.
  const closers = Array.from(
    new Map(
      assignments.filter((a) => a.role === "closer").map((a) => [a.user_id, a.full_name])
    ).entries()
  )
    .map(([userId, fullName]) => ({ userId, fullName }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  // Empty selectedStatusIds means "show all" — same convention the iOS
  // AppointmentsScreen filter uses.
  const query = searchText.trim().toLowerCase();
  const fromDate = scheduledFrom ? new Date(scheduledFrom) : null;
  const toDate = scheduledTo ? new Date(scheduledTo) : null;
  const visibleAppointments = appointments.filter((a) => {
    if (selectedStatusIds.size > 0 && !selectedStatusIds.has(a.status_id)) return false;
    const scheduledAt = new Date(a.scheduled_at);
    if (fromDate && scheduledAt < fromDate) return false;
    if (toDate && scheduledAt > toDate) return false;
    if (
      selectedCloserId &&
      !assignments.some((x) => x.appointment_id === a.id && x.role === "closer" && x.user_id === selectedCloserId)
    ) {
      return false;
    }
    if (query) {
      const lead = leadById.get(a.lead_id);
      const haystack = `${lead?.first_name ?? ""} ${lead?.last_name ?? ""} ${lead?.address_line ?? ""}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const groupedByStatus = statuses
    .map((status) => ({
      status,
      appointments: visibleAppointments
        .filter((a) => a.status_id === status.id)
        .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)),
    }))
    .filter((g) => g.appointments.length > 0);

  function toggleStatus(statusId: string) {
    setSelectedStatusIds((prev) => {
      const next = new Set(prev);
      if (next.has(statusId)) next.delete(statusId);
      else next.add(statusId);
      return next;
    });
  }

  function toggleCollapsed(statusId: string) {
    setCollapsedStatusIds((prev) => {
      const next = new Set(prev);
      if (next.has(statusId)) next.delete(statusId);
      else next.add(statusId);
      return next;
    });
  }

  const selected = appointments.find((a) => a.id === selectedId) ?? null;
  const activeFilterCount =
    (selectedStatusIds.size > 0 ? 1 : 0) +
    (scheduledFrom ? 1 : 0) +
    (scheduledTo ? 1 : 0) +
    (selectedCloserId ? 1 : 0);
  const hasAnyFilter = activeFilterCount > 0 || searchText.length > 0;

  function clearAllFilters() {
    setSearchText("");
    setSelectedStatusIds(new Set());
    setScheduledFrom("");
    setScheduledTo("");
    setSelectedCloserId("");
  }

  return (
    // flex-1 + min-h-0 (not h-full) so this genuinely participates in the
    // flex-grow chain from admin/appointments/layout.tsx + page.tsx
    // instead of relying on percentage height. The calendar/list content
    // area below is the only flex-1 child inside this column — everything
    // else (mobile bar, desktop filter row/card) is shrink-0 chrome, so
    // it never grows past its own content and the calendar gets whatever
    // space is actually left.
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden md:gap-6">
      {/* Mobile: one slim row — search, a filter icon (badge = active
          count) opening a bottom sheet with the status/date/closer
          controls, and an icon view toggle — instead of the full
          three-row Card, which ate most of the screen on a phone. Mirrors
          the same compaction done on the Leads page. */}
      <div className="flex shrink-0 items-center gap-2 md:hidden">
        {showMobileSearch ? (
          <>
            <Input
              autoFocus
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setShowMobileSearch(false);
                }
              }}
              placeholder="Search name or address…"
              className="min-w-0 flex-1 rounded-full"
            />
            <button
              onClick={() => {
                setShowMobileSearch(false);
                setSearchText("");
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/15 active:bg-black/10 dark:border-white/20 dark:active:bg-white/20"
              aria-label="Close search"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4.5 w-4.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </>
        ) : (
          <>
            {/* Collapsed to an icon by default — same treatment as the
                Leads page mobile bar, so the calendar/list gets the
                space back instead of an always-open search input. */}
            <button
              onClick={() => setShowMobileSearch(true)}
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/15 active:bg-black/10 dark:border-white/20 dark:active:bg-white/20"
              aria-label="Search appointments"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4.5 w-4.5">
                <circle cx="11" cy="11" r="7" />
                <path strokeLinecap="round" d="M21 21l-4.3-4.3" />
              </svg>
              {searchText && (
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-blue-600" />
              )}
            </button>
            <button
              onClick={() => setShowMobileFilters(true)}
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/15 active:bg-black/10 dark:border-white/20 dark:active:bg-white/20"
              aria-label="Filters"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4.5 w-4.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10M10 18h4" />
              </svg>
              {activeFilterCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <div className="flex shrink-0 overflow-hidden rounded-full border border-black/15 dark:border-white/20">
              <button
                onClick={() => setViewMode("calendar")}
                className={cn("flex h-9 w-9 items-center justify-center", viewMode === "calendar" ? "bg-blue-600 text-white dark:bg-blue-500" : "")}
                aria-label="Calendar view"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4.5 w-4.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 2v4m8-4v4M3.5 8h17M5 4h14a1.5 1.5 0 0 1 1.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5.5A1.5 1.5 0 0 1 5 4Z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={cn("flex h-9 w-9 items-center justify-center", viewMode === "list" ? "bg-blue-600 text-white dark:bg-blue-500" : "")}
                aria-label="List view"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4.5 w-4.5">
                  <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>

      {showMobileFilters && (
        <>
          <div className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm md:hidden" onClick={() => setShowMobileFilters(false)} />
          <div className="fixed inset-x-0 bottom-0 z-40 max-h-[80vh] space-y-4 overflow-y-auto rounded-t-2xl border-t border-black/10 bg-white/90 p-5 backdrop-blur-xl md:hidden dark:border-white/10 dark:bg-neutral-950/90">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Filters</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowMobileFilters(false)}>
                Done
              </Button>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">Status</label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setSelectedStatusIds(new Set())}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    selectedStatusIds.size === 0
                      ? "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500"
                      : "border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                  )}
                >
                  All
                </button>
                {statuses.map((status) => (
                  <button
                    key={status.id}
                    onClick={() => toggleStatus(status.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      selectedStatusIds.has(status.id)
                        ? "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500"
                        : "border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                    )}
                  >
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: status.color }} />
                    {status.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">From</label>
                <Input type="date" value={scheduledFrom} onChange={(e) => setScheduledFrom(e.target.value)} className="block w-full" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">To</label>
                <Input type="date" value={scheduledTo} onChange={(e) => setScheduledTo(e.target.value)} className="block w-full" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">Closer</label>
              <Select value={selectedCloserId} onChange={(e) => setSelectedCloserId(e.target.value)} className="block w-full">
                <option value="">All</option>
                {closers.map((c) => (
                  <option key={c.userId} value={c.userId}>
                    {c.fullName}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex gap-2 border-t border-black/10 pt-4 dark:border-white/10">
              <Button
                type="button"
                variant="secondary"
                onClick={() => startRefresh(() => router.refresh())}
                disabled={isRefreshing}
                className="flex-1"
              >
                {isRefreshing ? "Refreshing…" : "Refresh"}
              </Button>
              {hasAnyFilter && (
                <Button type="button" variant="secondary" onClick={clearAllFilters} className="flex-1">
                  Clear Filters
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      <div className="hidden shrink-0 items-center justify-between md:flex">
        <div className="flex gap-1 overflow-hidden rounded-full border border-black/15 p-0.5 dark:border-white/20">
          {(["list", "calendar"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
                viewMode === mode
                  ? "bg-blue-600 text-white dark:bg-blue-500"
                  : "text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
              )}
            >
              {mode}
            </button>
          ))}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => startRefresh(() => router.refresh())}
          disabled={isRefreshing}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
          {isRefreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      <Card className="hidden shrink-0 space-y-3 p-4 md:block">
        <Input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search name or address…"
          className="w-full"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSelectedStatusIds(new Set())}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              selectedStatusIds.size === 0
                ? "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500"
                : "border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            )}
          >
            All
          </button>
          {statuses.map((status) => (
            <button
              key={status.id}
              onClick={() => toggleStatus(status.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                selectedStatusIds.has(status.id)
                  ? "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500"
                  : "border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              )}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: status.color }} />
              {status.name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5">
            Scheduled from
            <Input
              type="date"
              value={scheduledFrom}
              onChange={(e) => setScheduledFrom(e.target.value)}
              className="text-xs"
            />
          </label>
          <label className="flex items-center gap-1.5">
            to
            <Input type="date" value={scheduledTo} onChange={(e) => setScheduledTo(e.target.value)} className="text-xs" />
          </label>
          <label className="flex items-center gap-1.5">
            Closer
            <Select value={selectedCloserId} onChange={(e) => setSelectedCloserId(e.target.value)} className="text-xs">
              <option value="">All</option>
              {closers.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {c.fullName}
                </option>
              ))}
            </Select>
          </label>
          {hasAnyFilter && (
            <button
              onClick={clearAllFilters}
              className="text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
            >
              Clear filters
            </button>
          )}
        </div>
      </Card>

      {appointments.length === 0 && (
        <p className="shrink-0 text-sm italic text-black/50 dark:text-white/50">No appointments yet.</p>
      )}
      {appointments.length > 0 && visibleAppointments.length === 0 && (
        <p className="shrink-0 text-sm italic text-black/50 dark:text-white/50">
          No appointments match your search/filters.
        </p>
      )}

      {viewMode === "calendar" && visibleAppointments.length > 0 && (
        <AppointmentsCalendar
          className="min-h-0 flex-1"
          appointments={visibleAppointments}
          statuses={statuses}
          leadById={leadById}
          onSelect={setSelectedId}
        />
      )}

      {viewMode === "list" && visibleAppointments.length > 0 && (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {groupedByStatus.map((group) => {
            const isCollapsed = collapsedStatusIds.has(group.status.id);
            return (
              <div key={group.status.id}>
                <button
                  onClick={() => toggleCollapsed(group.status.id)}
                  className="mb-2 flex w-full items-center gap-2 text-sm font-medium"
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: group.status.color }}
                  />
                  {group.status.name}
                  <span className="text-black/40 dark:text-white/40">({group.appointments.length})</span>
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
                  <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead className="bg-black/5 dark:bg-white/5">
                        <tr>
                          <th className="px-3 py-2 font-medium">Lead</th>
                          <th className="px-3 py-2 font-medium">Address</th>
                          <th className="px-3 py-2 font-medium">Date &amp; Time</th>
                          <th className="px-3 py-2 font-medium">Closer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.appointments.map((a) => {
                          const lead = leadById.get(a.lead_id);
                          const closerNames = assignments
                            .filter((x) => x.appointment_id === a.id && x.role === "closer")
                            .map((x) => x.full_name)
                            .join(", ");
                          return (
                            <tr
                              key={a.id}
                              onClick={() => setSelectedId(a.id)}
                              className="cursor-pointer border-t border-black/5 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
                            >
                              <td className="px-3 py-2">
                                {[lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || "Unknown"}
                              </td>
                              <td className="px-3 py-2 text-black/70 dark:text-white/70">
                                {lead?.address_line ?? "—"}
                              </td>
                              <td className="px-3 py-2">{new Date(a.scheduled_at).toLocaleString()}</td>
                              <td className="px-3 py-2">{closerNames || "Unassigned"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <AppointmentDetailPanel
          appointment={selected}
          lead={leadById.get(selected.lead_id) ?? null}
          statuses={statuses}
          formFields={formFields}
          assignments={assignments.filter((x) => x.appointment_id === selected.id)}
          notes={notes.filter((x) => x.appointment_id === selected.id)}
          activeProfiles={activeProfiles}
          sectionOrder={sectionOrder}
          onClose={() => setSelectedId(null)}
          onAppointmentUpdated={(updated) => {
            setAppointments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
          }}
          onAssignmentsUpdated={(newAssignments) => {
            setAssignments((prev) => [
              ...prev.filter((x) => x.appointment_id !== selected.id),
              ...newAssignments,
            ]);
          }}
          onNoteAdded={(note) => {
            setNotes((prev) => [note, ...prev]);
          }}
          onLeadNameUpdated={(leadId, firstName, lastName) => {
            setLeadsState((prev) =>
              prev.map((l) => (l.id === leadId ? { ...l, first_name: firstName, last_name: lastName } : l))
            );
          }}
        />
      )}
    </div>
  );
}
