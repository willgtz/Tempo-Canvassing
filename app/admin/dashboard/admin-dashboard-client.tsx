"use client";

import { useEffect, useMemo, useState } from "react";
import { StatTile } from "@/components/dashboard/stat-tile";
import { BarChart } from "@/components/dashboard/bar-chart";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { DoorKnockGoalsTable } from "@/components/dashboard/door-knock-goals-table";
import { DoorKnockDayBreakdown } from "@/components/dashboard/door-knock-day-breakdown";
import { DoorKnockMonthBreakdown } from "@/components/dashboard/door-knock-month-breakdown";
import { DoorKnockRangeBreakdown } from "@/components/dashboard/door-knock-range-breakdown";
import { WidgetCustomizeMenu } from "@/components/dashboard/widget-customize-menu";
import { useWidgetVisibility } from "@/components/dashboard/use-widget-visibility";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { exportAppointmentsCsv } from "./actions";
import {
  countInLastDays,
  countByDisposition,
  countByZip,
  countWithoutLocation,
  countManual,
  dailyCounts,
  countByRepViaZips,
  countNeverKnocked,
  filterAppointmentsByDate,
  countStuckAssignedNoCloserNotes,
  appointmentsByOpener,
  appointmentsByCloserAndStatus,
  computeShowRate,
  openerToCloserConversion,
  staleAppointments,
  averageHoursToFirstKnock,
  weeklyDispositionCounts,
  rollupByTeam,
  rollupNestedByTeam,
  laDateOnly,
  type StatLead,
  type StatAppointment,
  type AppointmentAssignmentRow,
  type AppointmentNoteRow,
  type AppointmentStatusRow,
} from "@/lib/dashboard/stats";

type DoorKnockCount = {
  user_id: string;
  full_name: string;
  verified_count: number;
  total_count: number;
};
type Disposition = { id: string; name: string; color: string; sort_order: number };
type Profile = { id: string; full_name: string; role: string; active: boolean };
type TeamZip = { user_id: string; full_name: string; zipcode: string };
type GoalRow = {
  goal_id: string;
  user_id: string;
  full_name: string;
  target_count: number;
  start_date: string;
  end_date: string;
  verified_count: number;
};
type DispositionHistoryRow = { lead_id: string; new_value: string | null; changed_at: string };
type LeadNoteRow = { lead_id: string; created_at: string };
type Team = { id: string; name: string };
type TeamMembership = { user_id: string; team_id: string };

const WIDGETS = [
  { id: "total", label: "Total leads" },
  { id: "last7", label: "Created in last 7 days" },
  { id: "last30", label: "Created in last 30 days" },
  { id: "activeReps", label: "Active reps" },
  { id: "withoutLocation", label: "Leads without a location" },
  { id: "manual", label: "Manually entered leads" },
  { id: "orphanZips", label: "Zips with no rep assigned" },
  { id: "neverKnocked", label: "Leads never knocked (no disposition, no notes)" },
  { id: "avgTimeToFirstKnock", label: "Average time to first knock" },
  { id: "trend", label: "Leads created — 30-day trend" },
  { id: "dispositionTrend", label: "Disposition trend — by week" },
  { id: "disposition", label: "Leads by disposition" },
  { id: "byRep", label: "Leads by rep" },
  { id: "doorsKnockedToday", label: "Doors knocked by rep (pick a day)" },
  { id: "doorsKnocked", label: "Doors knocked by rep (by month)" },
  { id: "doorsKnockedRange", label: "Doors knocked by rep (custom range)" },
  { id: "doorKnockGoals", label: "Door-knock goals by rep" },
  { id: "zip", label: "Leads by zip" },
  { id: "totalAppts", label: "Total appointments" },
  { id: "stuckAssigned", label: "Appointments stuck in Assigned (no closer notes)" },
  { id: "apptsByOpener", label: "Appointments by opener" },
  { id: "apptsByCloser", label: "Appointments by closer (outcome breakdown)" },
  { id: "showRate", label: "Show rate" },
  { id: "openerConversion", label: "Opener → closer conversion" },
  { id: "staleAppts", label: "Stale appointments (past due, still Assigned)" },
  { id: "knocksToApptRate", label: "Knocks → appointment rate" },
];

export function AdminDashboardClient({
  leads,
  doorKnockCounts,
  doorKnockCountsToday,
  dispositions,
  profiles,
  teamZips,
  doorKnockGoals,
  dispositionHistory,
  leadNotes,
  appointments,
  appointmentAssignments,
  appointmentNotes,
  appointmentStatuses,
  teamMemberships,
  teams,
  today,
}: {
  leads: StatLead[];
  doorKnockCounts: DoorKnockCount[];
  doorKnockCountsToday: DoorKnockCount[];
  dispositions: Disposition[];
  profiles: Profile[];
  teamZips: TeamZip[];
  doorKnockGoals: GoalRow[];
  dispositionHistory: DispositionHistoryRow[];
  leadNotes: LeadNoteRow[];
  appointments: StatAppointment[];
  appointmentAssignments: AppointmentAssignmentRow[];
  appointmentNotes: AppointmentNoteRow[];
  appointmentStatuses: AppointmentStatusRow[];
  teamMemberships: TeamMembership[];
  teams: Team[];
  today: string;
}) {
  const [repFilter, setRepFilter] = useState("all");
  const [zipFilter, setZipFilter] = useState("all");
  const [apptFrom, setApptFrom] = useState(() => {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() - 30);
    return laDateOnly(d);
  });
  const [apptTo, setApptTo] = useState(today);
  const [viewByTeam, setViewByTeam] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const { isVisible, toggle } = useWidgetVisibility("admin-dashboard-hidden-widgets");

  const dispositionById = useMemo(
    () => new Map(dispositions.map((d) => [d.id, d])),
    [dispositions]
  );

  // Every active profile, not just reps who hold a direct zip
  // assignment — a rep can now also see leads purely through team-based
  // sharing, so they need to be selectable here too.
  const repOptions = useMemo(() => {
    return profiles
      .filter((p) => p.active)
      .map((p) => ({ id: p.id, name: p.full_name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [profiles]);

  // Every zipcode actually present among the loaded leads — for an
  // admin this is already every zip company-wide (is_admin bypasses
  // leads_select entirely), so this naturally includes zips with no
  // direct assignment.
  const zipOptions = useMemo(() => Array.from(new Set(leads.map((l) => l.zipcode))).sort(), [leads]);

  // The selected rep's TRUE effective visibility, computed live via
  // visible_zipcodes/teammate_ids (same route the leads map/list uses) —
  // teamZips only ever reflects direct zip_assignments and was never
  // updated for Teams-based lateral sharing.
  // Tagged with the repId it was fetched for, so a stale response from
  // whichever rep was PREVIOUSLY selected is never mistaken for the
  // current one while a new fetch is in flight — "loading" and "stale"
  // are both just derived from this not matching repFilter, no separate
  // boolean needed.
  const [effectiveRepData, setEffectiveRepData] = useState<{
    repId: string;
    zips: Set<string>;
    teammates: Set<string>;
  } | null>(null);
  const [repPreviewError, setRepPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (repFilter === "all") return;
    let cancelled = false;
    fetch(`/api/reps/${repFilter}/effective-zips`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load rep's visibility.");
        return res.json() as Promise<{ zipcodes: string[]; teammateIds: string[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setEffectiveRepData({
          repId: repFilter,
          zips: new Set(data.zipcodes),
          teammates: new Set(data.teammateIds),
        });
        setRepPreviewError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setRepPreviewError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [repFilter]);

  const effectiveRepZips =
    repFilter !== "all" && effectiveRepData?.repId === repFilter ? effectiveRepData.zips : null;
  const effectiveRepTeammates =
    repFilter !== "all" && effectiveRepData?.repId === repFilter ? effectiveRepData.teammates : null;
  const loadingRepPreview = repFilter !== "all" && effectiveRepZips === null && !repPreviewError;

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (repFilter !== "all" && effectiveRepZips) {
        const isManualCarveOut =
          l.is_manual &&
          (l.entered_by === repFilter || (l.entered_by != null && effectiveRepTeammates?.has(l.entered_by)) === true);
        if (!effectiveRepZips.has(l.zipcode) && !isManualCarveOut) return false;
      }
      if (zipFilter !== "all" && l.zipcode !== zipFilter) return false;
      return true;
    });
  }, [leads, repFilter, effectiveRepZips, effectiveRepTeammates, zipFilter]);

  const dispositionBreakdown = useMemo(() => {
    return Array.from(countByDisposition(filteredLeads), ([id, count]) => ({
      label: id ? (dispositionById.get(id)?.name ?? "Unknown") : "No disposition",
      value: count,
      color: id ? dispositionById.get(id)?.color : undefined,
    })).sort((a, b) => b.value - a.value);
  }, [filteredLeads, dispositionById]);

  const zipBreakdown = useMemo(() => {
    return Array.from(countByZip(filteredLeads), ([zip, count]) => ({ label: zip, value: count })).sort(
      (a, b) => b.value - a.value
    );
  }, [filteredLeads]);

  const nameByUserId = useMemo(() => new Map(profiles.map((p) => [p.id, p.full_name])), [profiles]);

  const zipToUserIds = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const tz of teamZips) {
      const list = map.get(tz.zipcode) ?? [];
      list.push(tz.user_id);
      map.set(tz.zipcode, list);
    }
    return map;
  }, [teamZips]);

  const byRepBreakdown = useMemo(() => {
    return Array.from(countByRepViaZips(filteredLeads, zipToUserIds), ([userId, count]) => ({
      label: nameByUserId.get(userId) ?? "Unknown",
      value: count,
    })).sort((a, b) => b.value - a.value);
  }, [filteredLeads, zipToUserIds, nameByUserId]);

  // Unlike the BarChart breakdowns above, this doesn't hide behind
  // showRepBreakdown when a single rep is selected — a single rep's own
  // goal-vs-progress is still meaningful with one row, unlike a one-bar
  // chart.
  const doorKnockGoalsFiltered = useMemo(() => {
    return repFilter === "all" ? doorKnockGoals : doorKnockGoals.filter((g) => g.user_id === repFilter);
  }, [doorKnockGoals, repFilter]);

  const activeRepsCount = useMemo(
    () => profiles.filter((p) => p.role === "rep" && p.active).length,
    [profiles]
  );

  const orphanZipsCount = useMemo(() => {
    const assignedZips = new Set(teamZips.map((tz) => tz.zipcode));
    const leadZips = new Set(filteredLeads.map((l) => l.zipcode));
    let count = 0;
    for (const z of leadZips) if (!assignedZips.has(z)) count++;
    return count;
  }, [teamZips, filteredLeads]);

  const trend30 = useMemo(() => dailyCounts(filteredLeads, 30), [filteredLeads]);

  // Trivial (one bar) once scoped to a single rep — skip rather than show
  // a chart with one data point.
  const showRepBreakdown = repFilter === "all";

  // ============================================================
  // Lead-activity stats ("never knocked" / time-to-first-knock /
  // disposition trend) — dispositionHistory/leadNotes are raw event rows,
  // not tied to a lead's CURRENT disposition_id, so a lead touched once
  // and later reset still counts as knocked.
  // ============================================================
  const touchedLeadIds = useMemo(() => {
    const set = new Set<string>();
    for (const h of dispositionHistory) set.add(h.lead_id);
    for (const n of leadNotes) set.add(n.lead_id);
    return set;
  }, [dispositionHistory, leadNotes]);

  const neverKnockedCount = useMemo(
    () => countNeverKnocked(filteredLeads.map((l) => l.id), touchedLeadIds),
    [filteredLeads, touchedLeadIds]
  );

  const firstKnockAtById = useMemo(() => {
    const map = new Map<string, string>();
    const consider = (leadId: string, at: string) => {
      const existing = map.get(leadId);
      if (!existing || at < existing) map.set(leadId, at);
    };
    for (const h of dispositionHistory) consider(h.lead_id, h.changed_at);
    for (const n of leadNotes) consider(n.lead_id, n.created_at);
    return map;
  }, [dispositionHistory, leadNotes]);

  const leadCreatedAtById = useMemo(() => new Map(leads.map((l) => [l.id, l.created_at])), [leads]);

  const avgHoursToFirstKnock = useMemo(
    () => averageHoursToFirstKnock(leadCreatedAtById, firstKnockAtById),
    [leadCreatedAtById, firstKnockAtById]
  );

  const dispositionTrend = useMemo(() => weeklyDispositionCounts(dispositionHistory, 8), [dispositionHistory]);

  // ============================================================
  // Appointment stats — scoped to the date range picker (by
  // scheduled_at) and, where a specific rep is selected up top, to
  // appointments that rep is assigned to in any role.
  // ============================================================
  const apptRangeValid = apptFrom <= apptTo;
  const apptsInRange = useMemo(
    () => (apptRangeValid ? filterAppointmentsByDate(appointments, apptFrom, apptTo) : []),
    [appointments, apptFrom, apptTo, apptRangeValid]
  );

  const repApptIds = useMemo(() => {
    if (repFilter === "all") return null;
    const set = new Set<string>();
    for (const a of appointmentAssignments) {
      if (a.user_id === repFilter) set.add(a.appointment_id);
    }
    return set;
  }, [appointmentAssignments, repFilter]);

  const apptsInRangeForRep = useMemo(() => {
    if (!repApptIds) return apptsInRange;
    return apptsInRange.filter((a) => repApptIds.has(a.id));
  }, [apptsInRange, repApptIds]);

  const statusNameById = useMemo(() => new Map(appointmentStatuses.map((s) => [s.id, s.name])), [appointmentStatuses]);
  const assignedStatusId = useMemo(
    () => appointmentStatuses.find((s) => s.name === "Assigned")?.id,
    [appointmentStatuses]
  );
  const closedStatusId = useMemo(
    () => appointmentStatuses.find((s) => s.name === "Closed")?.id,
    [appointmentStatuses]
  );
  const noShowStatusId = useMemo(
    () => appointmentStatuses.find((s) => s.name === "No Show")?.id,
    [appointmentStatuses]
  );

  const stuckAssignedCount = useMemo(
    () =>
      countStuckAssignedNoCloserNotes(apptsInRangeForRep, appointmentAssignments, appointmentNotes, assignedStatusId),
    [apptsInRangeForRep, appointmentAssignments, appointmentNotes, assignedStatusId]
  );

  const teamIdsByUser = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of teamMemberships) {
      const list = map.get(m.user_id) ?? [];
      list.push(m.team_id);
      map.set(m.user_id, list);
    }
    return map;
  }, [teamMemberships]);
  const teamNameById = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);
  // Team view replaces "which rep" with "which team" entirely, so the
  // single-rep filter above doesn't apply here — showing every team,
  // regardless of repFilter, is what "view by team" means.
  const nameByIdForView = viewByTeam ? teamNameById : nameByUserId;

  const openerCountsRaw = useMemo(
    () => appointmentsByOpener(apptsInRange, appointmentAssignments),
    [apptsInRange, appointmentAssignments]
  );
  const openerCounts = useMemo(() => {
    const base = viewByTeam ? rollupByTeam(openerCountsRaw, teamIdsByUser) : openerCountsRaw;
    if (viewByTeam || repFilter === "all") return base;
    const filtered = new Map<string, number>();
    if (base.has(repFilter)) filtered.set(repFilter, base.get(repFilter) as number);
    return filtered;
  }, [openerCountsRaw, viewByTeam, teamIdsByUser, repFilter]);
  const openerCountsTable = useMemo(
    () =>
      Array.from(openerCounts, ([id, count]) => ({ id, label: nameByIdForView.get(id) ?? "Unknown", count })).sort(
        (a, b) => b.count - a.count
      ),
    [openerCounts, nameByIdForView]
  );

  const closerByStatusRaw = useMemo(
    () => appointmentsByCloserAndStatus(apptsInRange, appointmentAssignments),
    [apptsInRange, appointmentAssignments]
  );
  const closerByStatus = useMemo(() => {
    const base = viewByTeam ? rollupNestedByTeam(closerByStatusRaw, teamIdsByUser) : closerByStatusRaw;
    if (viewByTeam || repFilter === "all") return base;
    const filtered = new Map<string, Map<string, number>>();
    if (base.has(repFilter)) filtered.set(repFilter, base.get(repFilter) as Map<string, number>);
    return filtered;
  }, [closerByStatusRaw, viewByTeam, teamIdsByUser, repFilter]);

  const closerOutcomeStatuses = useMemo(
    () => [...appointmentStatuses].sort((a, b) => a.sort_order - b.sort_order),
    [appointmentStatuses]
  );
  const closerOutcomeTable = useMemo(() => {
    return Array.from(closerByStatus, ([id, byStatus]) => {
      const closed = closedStatusId ? (byStatus.get(closedStatusId) ?? 0) : 0;
      const noShow = noShowStatusId ? (byStatus.get(noShowStatusId) ?? 0) : 0;
      return {
        id,
        label: nameByIdForView.get(id) ?? "Unknown",
        byStatus,
        total: Array.from(byStatus.values()).reduce((a, b) => a + b, 0),
        showRate: computeShowRate(closed, noShow),
      };
    }).sort((a, b) => b.total - a.total);
  }, [closerByStatus, nameByIdForView, closedStatusId, noShowStatusId]);

  const overallShowRate = useMemo(() => {
    let closed = 0;
    let noShow = 0;
    for (const a of apptsInRangeForRep) {
      if (closedStatusId && a.status_id === closedStatusId) closed++;
      if (noShowStatusId && a.status_id === noShowStatusId) noShow++;
    }
    return computeShowRate(closed, noShow);
  }, [apptsInRangeForRep, closedStatusId, noShowStatusId]);

  const openerConversionRaw = useMemo(
    () => openerToCloserConversion(apptsInRange, appointmentAssignments, closedStatusId),
    [apptsInRange, appointmentAssignments, closedStatusId]
  );
  const openerConversionTable = useMemo(() => {
    const base = viewByTeam
      ? (() => {
          const rolled = new Map<string, { total: number; closed: number }>();
          for (const [userId, v] of openerConversionRaw) {
            for (const teamId of teamIdsByUser.get(userId) ?? []) {
              const entry = rolled.get(teamId) ?? { total: 0, closed: 0 };
              entry.total += v.total;
              entry.closed += v.closed;
              rolled.set(teamId, entry);
            }
          }
          return rolled;
        })()
      : openerConversionRaw;
    const scoped =
      viewByTeam || repFilter === "all"
        ? base
        : (() => {
            const filtered = new Map<string, { total: number; closed: number }>();
            if (base.has(repFilter)) filtered.set(repFilter, base.get(repFilter) as { total: number; closed: number });
            return filtered;
          })();
    return Array.from(scoped, ([id, v]) => ({
      id,
      label: nameByIdForView.get(id) ?? "Unknown",
      total: v.total,
      closed: v.closed,
      rate: v.total > 0 ? v.closed / v.total : null,
    })).sort((a, b) => b.total - a.total);
  }, [openerConversionRaw, viewByTeam, teamIdsByUser, repFilter, nameByIdForView]);

  // Deliberately NOT scoped to the date-range picker — "stale" is a
  // right-now alert (what's overdue as of this moment), not a historical
  // report, so it always looks at every currently-Assigned appointment.
  const staleAppts = useMemo(
    () => staleAppointments(repApptIds ? appointments.filter((a) => repApptIds.has(a.id)) : appointments, assignedStatusId),
    [appointments, repApptIds, assignedStatusId]
  );

  const closerNamesByAppt = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of appointmentAssignments) {
      if (a.role !== "closer") continue;
      const list = map.get(a.appointment_id) ?? [];
      list.push(nameByUserId.get(a.user_id) ?? "Unknown");
      map.set(a.appointment_id, list);
    }
    return map;
  }, [appointmentAssignments, nameByUserId]);

  // door_knock_counts (schema.sql) self-scopes via its own internal
  // can_view_door_knock_count check — is_admin() short-circuits it here,
  // same reasoning DoorKnockRangeBreakdown already relies on. Fetched
  // client-side (not from the server component) because it needs to
  // follow the SAME arbitrary apptFrom/apptTo range as the appointment
  // stats above, which only exist once the date pickers are touched.
  const [rangeKnockCounts, setRangeKnockCounts] = useState<DoorKnockCount[]>([]);
  const [rangeKnockFetchedFor, setRangeKnockFetchedFor] = useState<{ from: string; to: string } | null>(null);
  useEffect(() => {
    if (!apptRangeValid) return;
    if (rangeKnockFetchedFor && rangeKnockFetchedFor.from === apptFrom && rangeKnockFetchedFor.to === apptTo) return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .rpc("door_knock_counts", { from_date: apptFrom, to_date: apptTo })
      .then(({ data }) => {
        if (cancelled) return;
        setRangeKnockCounts((data ?? []) as DoorKnockCount[]);
        setRangeKnockFetchedFor({ from: apptFrom, to: apptTo });
      });
    return () => {
      cancelled = true;
    };
  }, [apptFrom, apptTo, apptRangeValid, rangeKnockFetchedFor]);

  // Appointments SET by a rep (as opener, via created_by — the rep who
  // actually booked it) vs. that same rep's verified door knocks in the
  // same window — "how many doors does it take this rep to land one
  // appointment," a quality-of-pitch signal independent of raw activity.
  const knocksToApptTable = useMemo(() => {
    const apptsCreatedByUser = new Map<string, number>();
    for (const a of apptsInRange) {
      apptsCreatedByUser.set(a.created_by, (apptsCreatedByUser.get(a.created_by) ?? 0) + 1);
    }
    const rows = rangeKnockCounts
      .filter((k) => repFilter === "all" || k.user_id === repFilter)
      .map((k) => {
        const apptCount = apptsCreatedByUser.get(k.user_id) ?? 0;
        return {
          id: k.user_id,
          label: k.full_name,
          knocks: k.verified_count,
          appts: apptCount,
          rate: apptCount > 0 ? k.verified_count / apptCount : null,
        };
      });
    return rows.sort((a, b) => b.knocks - a.knocks);
  }, [rangeKnockCounts, apptsInRange, repFilter]);

  function handleExportCsv() {
    setExportError(null);
    setIsExporting(true);
    exportAppointmentsCsv(apptFrom, apptTo)
      .then((result) => {
        if (!result.ok) {
          setExportError(result.error);
          return;
        }
        const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `appointments-${apptFrom}-to-${apptTo}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .finally(() => setIsExporting(false));
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            Company-wide stats. Filter down to a specific rep or zip.
          </p>
        </div>
        <WidgetCustomizeMenu widgets={WIDGETS} isVisible={isVisible} onToggle={toggle} />
      </div>

      <Card className="flex flex-wrap items-end gap-3 p-3">
        <div className="space-y-1">
          <label className="text-xs font-medium">Rep</label>
          <Select value={repFilter} onChange={(e) => setRepFilter(e.target.value)} className="block">
            <option value="all">All reps</option>
            {repOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          {repFilter !== "all" && loadingRepPreview && (
            <p className="text-xs text-black/50 dark:text-white/50">Loading…</p>
          )}
          {repFilter !== "all" && repPreviewError && (
            <p className="text-xs text-red-600 dark:text-red-400">{repPreviewError}</p>
          )}
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Zip</label>
          <Select value={zipFilter} onChange={(e) => setZipFilter(e.target.value)} className="block">
            <option value="all">All zips</option>
            {zipOptions.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </Select>
        </div>
        {(repFilter !== "all" || zipFilter !== "all") && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setRepFilter("all");
              setZipFilter("all");
            }}
          >
            Clear filters
          </Button>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {isVisible("total") && <StatTile label="Total leads" value={filteredLeads.length} />}
        {isVisible("last7") && (
          <StatTile label="Created in last 7 days" value={countInLastDays(filteredLeads, 7)} />
        )}
        {isVisible("last30") && (
          <StatTile label="Created in last 30 days" value={countInLastDays(filteredLeads, 30)} />
        )}
        {isVisible("activeReps") && <StatTile label="Active reps" value={activeRepsCount} />}
        {isVisible("withoutLocation") && (
          <StatTile
            label="Leads without a location"
            value={countWithoutLocation(filteredLeads)}
          />
        )}
        {isVisible("manual") && (
          <StatTile label="Manually entered leads" value={countManual(filteredLeads)} />
        )}
        {isVisible("orphanZips") && (
          <StatTile label="Zips with no rep assigned" value={orphanZipsCount} />
        )}
        {isVisible("neverKnocked") && (
          <StatTile
            label="Leads never knocked"
            value={neverKnockedCount}
            hint="No disposition change and no note, ever"
          />
        )}
        {isVisible("avgTimeToFirstKnock") && (
          <StatTile
            label="Avg. time to first knock"
            value={avgHoursToFirstKnock == null ? 0 : Math.round(avgHoursToFirstKnock)}
            hint={avgHoursToFirstKnock == null ? "No knocked leads yet" : "hours from lead created to first touch"}
          />
        )}
      </div>

      {isVisible("trend") && (
        <Card className="p-4">
          <h2 className="text-sm font-medium">Leads created — last 30 days</h2>
          <div className="mt-3">
            <TrendChart data={trend30} />
          </div>
        </Card>
      )}

      {isVisible("dispositionTrend") && (
        <Card className="overflow-x-auto p-4">
          <h2 className="text-sm font-medium">Disposition trend — last 8 weeks</h2>
          <p className="mt-1 text-xs text-black/50 dark:text-white/50">
            Disposition CHANGES per week (not lead creation) — a shift in a rep&apos;s outcome mix
            shows up here even for leads created long ago.
          </p>
          <div className="mt-3">
            {dispositionTrend.countsByDisposition.size === 0 ? (
              <p className="text-sm italic text-black/40 dark:text-white/40">
                No disposition changes in this window.
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-black/5 dark:bg-white/5">
                  <tr>
                    <th className="px-3 py-2 font-medium">Disposition</th>
                    {dispositionTrend.weekStarts.map((w) => (
                      <th key={w} className="px-3 py-2 text-right font-medium">
                        {new Date(`${w}T00:00:00`).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from(dispositionTrend.countsByDisposition, ([name, series]) => ({
                    name,
                    series,
                    total: series.reduce((a, b) => a + b, 0),
                  }))
                    .sort((a, b) => b.total - a.total)
                    .map((row) => (
                      <tr key={row.name} className="border-t border-black/5 dark:border-white/10">
                        <td className="px-3 py-2">{row.name}</td>
                        {row.series.map((count, i) => (
                          <td key={i} className="px-3 py-2 text-right">
                            {count}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {isVisible("disposition") && (
          <Card className="p-4">
            <h2 className="text-sm font-medium">Leads by disposition</h2>
            <div className="mt-3">
              <BarChart items={dispositionBreakdown} />
            </div>
          </Card>
        )}
        {isVisible("zip") && (
          <Card className="p-4">
            <h2 className="text-sm font-medium">Leads by zip</h2>
            <div className="mt-3">
              <BarChart items={zipBreakdown} />
            </div>
          </Card>
        )}
        {isVisible("byRep") && showRepBreakdown && (
          <Card className="p-4">
            <h2 className="text-sm font-medium">Leads by rep</h2>
            <div className="mt-3">
              <BarChart items={byRepBreakdown} />
            </div>
          </Card>
        )}
        {/* Unlike the leads-by-rep/disposition/zip charts above, these
            two deliberately don't hide behind showRepBreakdown when a
            single rep is selected — that's exactly when an admin wants
            to see that specific rep's number, not have it disappear. */}
        {isVisible("doorsKnockedToday") && (
          <Card className="p-4">
            <h2 className="text-sm font-medium">Doors knocked by rep (pick a day)</h2>
            <DoorKnockDayBreakdown
              today={today}
              repFilter={repFilter}
              initialCounts={doorKnockCountsToday}
            />
          </Card>
        )}
        {isVisible("doorsKnocked") && (
          <Card className="p-4">
            <h2 className="text-sm font-medium">Doors knocked by rep (by month)</h2>
            <DoorKnockMonthBreakdown
              today={today}
              repFilter={repFilter}
              initialCounts={doorKnockCounts}
            />
          </Card>
        )}
        {isVisible("doorsKnockedRange") && (
          <Card className="p-4">
            <h2 className="text-sm font-medium">Doors knocked by rep (custom range)</h2>
            <DoorKnockRangeBreakdown today={today} repFilter={repFilter} />
          </Card>
        )}
        {isVisible("doorKnockGoals") && (
          <Card className="overflow-x-auto p-4">
            <h2 className="text-sm font-medium">Door-knock goals by rep</h2>
            <div className="mt-3">
              <DoorKnockGoalsTable goals={doorKnockGoalsFiltered} today={today} />
            </div>
          </Card>
        )}
      </div>

      {(isVisible("totalAppts") ||
        isVisible("stuckAssigned") ||
        isVisible("apptsByOpener") ||
        isVisible("apptsByCloser") ||
        isVisible("showRate") ||
        isVisible("openerConversion") ||
        isVisible("staleAppts") ||
        isVisible("knocksToApptRate")) && (
        <div className="space-y-4 border-t border-black/10 pt-6 dark:border-white/10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Appointments</h2>
              <p className="text-sm text-black/60 dark:text-white/60">
                Filtered by scheduled date. The rep filter above also narrows these.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">From</label>
                <input
                  type="date"
                  value={apptFrom}
                  max={apptTo}
                  onChange={(e) => setApptFrom(e.target.value)}
                  className="block rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">To</label>
                <input
                  type="date"
                  value={apptTo}
                  max={today}
                  onChange={(e) => setApptTo(e.target.value)}
                  className="block rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
                />
              </div>
              <label className="flex items-center gap-1.5 pb-1.5 text-sm">
                <input type="checkbox" checked={viewByTeam} onChange={(e) => setViewByTeam(e.target.checked)} />
                View by team
              </label>
              <Button type="button" variant="secondary" size="sm" onClick={handleExportCsv} disabled={isExporting}>
                {isExporting ? "Exporting…" : "Export CSV"}
              </Button>
            </div>
          </div>
          {!apptRangeValid && (
            <p className="text-sm text-red-600 dark:text-red-400">Start date must be on or before the end date.</p>
          )}
          {exportError && <p className="text-sm text-red-600 dark:text-red-400">{exportError}</p>}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {isVisible("totalAppts") && (
              <StatTile label="Total appointments" value={apptsInRangeForRep.length} />
            )}
            {isVisible("stuckAssigned") && (
              <StatTile
                label="Stuck in Assigned"
                value={stuckAssignedCount}
                hint="Closer assigned, no notes, no outcome"
              />
            )}
            {isVisible("showRate") && (
              <StatTile
                label="Show rate"
                value={overallShowRate == null ? 0 : Math.round(overallShowRate * 100)}
                hint={overallShowRate == null ? "No Closed/No Show appointments yet" : "% Closed / (Closed + No Show)"}
              />
            )}
            {isVisible("staleAppts") && (
              <StatTile
                label="Stale appointments"
                value={staleAppts.length}
                hint="Past due, still sitting in Assigned"
              />
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {isVisible("apptsByOpener") && (
              <Card className="overflow-x-auto p-4">
                <h2 className="text-sm font-medium">Appointments by opener{viewByTeam ? " — by team" : ""}</h2>
                <div className="mt-3">
                  {openerCountsTable.length === 0 ? (
                    <p className="text-sm italic text-black/40 dark:text-white/40">No appointments in this range.</p>
                  ) : (
                    <BarChart items={openerCountsTable.map((r) => ({ label: r.label, value: r.count }))} />
                  )}
                </div>
              </Card>
            )}
            {isVisible("apptsByCloser") && (
              <Card className="overflow-x-auto p-4">
                <h2 className="text-sm font-medium">
                  Appointments by closer{viewByTeam ? " — by team" : ""} (outcome breakdown)
                </h2>
                <div className="mt-3">
                  {closerOutcomeTable.length === 0 ? (
                    <p className="text-sm italic text-black/40 dark:text-white/40">No appointments in this range.</p>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead className="bg-black/5 dark:bg-white/5">
                        <tr>
                          <th className="px-3 py-2 font-medium">{viewByTeam ? "Team" : "Closer"}</th>
                          {closerOutcomeStatuses.map((s) => (
                            <th key={s.id} className="px-3 py-2 text-right font-medium">
                              {s.name}
                            </th>
                          ))}
                          <th className="px-3 py-2 text-right font-medium">Show rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {closerOutcomeTable.map((row) => (
                          <tr key={row.id} className="border-t border-black/5 dark:border-white/10">
                            <td className="px-3 py-2">{row.label}</td>
                            {closerOutcomeStatuses.map((s) => (
                              <td key={s.id} className="px-3 py-2 text-right">
                                {row.byStatus.get(s.id) ?? 0}
                              </td>
                            ))}
                            <td className="px-3 py-2 text-right">
                              {row.showRate == null ? "—" : `${Math.round(row.showRate * 100)}%`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </Card>
            )}
            {isVisible("openerConversion") && (
              <Card className="overflow-x-auto p-4">
                <h2 className="text-sm font-medium">
                  Opener → closer conversion{viewByTeam ? " — by team" : ""}
                </h2>
                <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                  Of the appointments each opener set, what fraction actually Closed.
                </p>
                <div className="mt-3">
                  {openerConversionTable.length === 0 ? (
                    <p className="text-sm italic text-black/40 dark:text-white/40">No appointments in this range.</p>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead className="bg-black/5 dark:bg-white/5">
                        <tr>
                          <th className="px-3 py-2 font-medium">{viewByTeam ? "Team" : "Opener"}</th>
                          <th className="px-3 py-2 text-right font-medium">Set</th>
                          <th className="px-3 py-2 text-right font-medium">Closed</th>
                          <th className="px-3 py-2 text-right font-medium">Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openerConversionTable.map((row) => (
                          <tr key={row.id} className="border-t border-black/5 dark:border-white/10">
                            <td className="px-3 py-2">{row.label}</td>
                            <td className="px-3 py-2 text-right">{row.total}</td>
                            <td className="px-3 py-2 text-right">{row.closed}</td>
                            <td className="px-3 py-2 text-right">
                              {row.rate == null ? "—" : `${Math.round(row.rate * 100)}%`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </Card>
            )}
            {isVisible("knocksToApptRate") && (
              <Card className="overflow-x-auto p-4">
                <h2 className="text-sm font-medium">Knocks → appointment rate</h2>
                <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                  Verified door knocks vs. appointments that rep booked, same date range.
                </p>
                <div className="mt-3">
                  {knocksToApptTable.length === 0 ? (
                    <p className="text-sm italic text-black/40 dark:text-white/40">No data in this range yet.</p>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead className="bg-black/5 dark:bg-white/5">
                        <tr>
                          <th className="px-3 py-2 font-medium">Rep</th>
                          <th className="px-3 py-2 text-right font-medium">Knocks</th>
                          <th className="px-3 py-2 text-right font-medium">Appts set</th>
                          <th className="px-3 py-2 text-right font-medium">Knocks / appt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {knocksToApptTable.map((row) => (
                          <tr key={row.id} className="border-t border-black/5 dark:border-white/10">
                            <td className="px-3 py-2">{row.label}</td>
                            <td className="px-3 py-2 text-right">{row.knocks}</td>
                            <td className="px-3 py-2 text-right">{row.appts}</td>
                            <td className="px-3 py-2 text-right">
                              {row.rate == null ? "—" : row.rate.toFixed(1)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </Card>
            )}
          </div>

          {isVisible("staleAppts") && staleAppts.length > 0 && (
            <Card className="overflow-x-auto p-4">
              <h2 className="text-sm font-medium">Stale appointments</h2>
              <div className="mt-3">
                <table className="w-full text-left text-sm">
                  <thead className="bg-black/5 dark:bg-white/5">
                    <tr>
                      <th className="px-3 py-2 font-medium">Scheduled</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Closer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staleAppts
                      .slice()
                      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
                      .map((a) => (
                        <tr key={a.id} className="border-t border-black/5 dark:border-white/10">
                          <td className="px-3 py-2">{new Date(a.scheduled_at).toLocaleString()}</td>
                          <td className="px-3 py-2">{statusNameById.get(a.status_id) ?? "Unknown"}</td>
                          <td className="px-3 py-2">{(closerNamesByAppt.get(a.id) ?? []).join(", ") || "—"}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
