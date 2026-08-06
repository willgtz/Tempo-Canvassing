"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppointmentDetailPanel } from "./appointment-detail-panel";
import { AppointmentsCalendar } from "./appointments-calendar";
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
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded border border-black/15 p-0.5 dark:border-white/20">
          {(["list", "calendar"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`rounded px-2.5 py-1 text-xs font-medium capitalize ${
                viewMode === mode
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/5"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        <button
          onClick={() => startRefresh(() => router.refresh())}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 rounded border border-black/15 px-2.5 py-1 text-xs font-medium disabled:opacity-50 dark:border-white/20"
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
        </button>
      </div>

      <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
        <input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search name or address…"
          className="w-full rounded border border-black/15 px-2 py-1.5 text-sm dark:border-white/20 dark:bg-transparent"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSelectedStatusIds(new Set())}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              selectedStatusIds.size === 0
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/15 dark:border-white/20"
            }`}
          >
            All
          </button>
          {statuses.map((status) => (
            <button
              key={status.id}
              onClick={() => toggleStatus(status.id)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                selectedStatusIds.has(status.id)
                  ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                  : "border-black/15 dark:border-white/20"
              }`}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: status.color }} />
              {status.name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5">
            Scheduled from
            <input
              type="date"
              value={scheduledFrom}
              onChange={(e) => setScheduledFrom(e.target.value)}
              className="rounded border border-black/15 px-2 py-1 dark:border-white/20 dark:bg-transparent"
            />
          </label>
          <label className="flex items-center gap-1.5">
            to
            <input
              type="date"
              value={scheduledTo}
              onChange={(e) => setScheduledTo(e.target.value)}
              className="rounded border border-black/15 px-2 py-1 dark:border-white/20 dark:bg-transparent"
            />
          </label>
          <label className="flex items-center gap-1.5">
            Closer
            <select
              value={selectedCloserId}
              onChange={(e) => setSelectedCloserId(e.target.value)}
              className="rounded border border-black/15 px-2 py-1 dark:border-white/20 dark:bg-transparent"
            >
              <option value="">All</option>
              {closers.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {c.fullName}
                </option>
              ))}
            </select>
          </label>
          {(searchText || selectedStatusIds.size > 0 || scheduledFrom || scheduledTo || selectedCloserId) && (
            <button
              onClick={() => {
                setSearchText("");
                setSelectedStatusIds(new Set());
                setScheduledFrom("");
                setScheduledTo("");
                setSelectedCloserId("");
              }}
              className="text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {appointments.length === 0 && (
        <p className="text-sm italic text-black/50 dark:text-white/50">No appointments yet.</p>
      )}
      {appointments.length > 0 && visibleAppointments.length === 0 && (
        <p className="text-sm italic text-black/50 dark:text-white/50">No appointments match your search/filters.</p>
      )}

      {viewMode === "calendar" && visibleAppointments.length > 0 && (
        <AppointmentsCalendar
          appointments={visibleAppointments}
          statuses={statuses}
          leadById={leadById}
          onSelect={setSelectedId}
        />
      )}

      {viewMode === "list" && groupedByStatus.map((group) => {
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
              <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
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
