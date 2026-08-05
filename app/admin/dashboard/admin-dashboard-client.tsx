"use client";

import { useMemo, useState } from "react";
import { StatTile } from "@/components/dashboard/stat-tile";
import { BarChart } from "@/components/dashboard/bar-chart";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { WidgetCustomizeMenu } from "@/components/dashboard/widget-customize-menu";
import { useWidgetVisibility } from "@/components/dashboard/use-widget-visibility";
import {
  countInLastDays,
  countByDisposition,
  countByZip,
  countWithoutLocation,
  countManual,
  dailyCounts,
  doorsKnockedByRep,
  countByRepViaZips,
  type StatLead,
} from "@/lib/dashboard/stats";

type HistoryEntry = { user_id: string; lead_id: string; changed_at: string };
type Disposition = { id: string; name: string; color: string; sort_order: number };
type Profile = { id: string; full_name: string; role: string; active: boolean };
type TeamZip = { user_id: string; full_name: string; zipcode: string };

const WIDGETS = [
  { id: "total", label: "Total leads" },
  { id: "last7", label: "Created in last 7 days" },
  { id: "last30", label: "Created in last 30 days" },
  { id: "activeReps", label: "Active reps" },
  { id: "withoutLocation", label: "Leads without a location" },
  { id: "manual", label: "Manually entered leads" },
  { id: "orphanZips", label: "Zips with no rep assigned" },
  { id: "trend", label: "Leads created — 30-day trend" },
  { id: "disposition", label: "Leads by disposition" },
  { id: "byRep", label: "Leads by rep" },
  { id: "doorsKnocked", label: "Doors knocked by rep (30 days)" },
  { id: "zip", label: "Leads by zip" },
];

export function AdminDashboardClient({
  leads,
  history,
  dispositions,
  profiles,
  teamZips,
}: {
  leads: StatLead[];
  history: HistoryEntry[];
  dispositions: Disposition[];
  profiles: Profile[];
  teamZips: TeamZip[];
}) {
  const [repFilter, setRepFilter] = useState("all");
  const [zipFilter, setZipFilter] = useState("all");
  const { isVisible, toggle } = useWidgetVisibility("admin-dashboard-hidden-widgets");

  const dispositionById = useMemo(
    () => new Map(dispositions.map((d) => [d.id, d])),
    [dispositions]
  );

  const repOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const tz of teamZips) seen.set(tz.user_id, tz.full_name);
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [teamZips]);

  const zipOptions = useMemo(
    () => Array.from(new Set(teamZips.map((tz) => tz.zipcode))).sort(),
    [teamZips]
  );

  const repZips = useMemo(() => {
    if (repFilter === "all") return null;
    return new Set(teamZips.filter((tz) => tz.user_id === repFilter).map((tz) => tz.zipcode));
  }, [teamZips, repFilter]);

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (repZips && !repZips.has(l.zipcode)) return false;
      if (zipFilter !== "all" && l.zipcode !== zipFilter) return false;
      return true;
    });
  }, [leads, repZips, zipFilter]);

  const filteredLeadIds = useMemo(() => new Set(filteredLeads.map((l) => l.id)), [filteredLeads]);

  const filteredHistory = useMemo(
    () => history.filter((h) => filteredLeadIds.has(h.lead_id)),
    [history, filteredLeadIds]
  );

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

  const doorsKnockedBreakdown = useMemo(() => {
    return Array.from(doorsKnockedByRep(filteredHistory, 30), ([userId, count]) => ({
      label: nameByUserId.get(userId) ?? "Unknown",
      value: count,
    })).sort((a, b) => b.value - a.value);
  }, [filteredHistory, nameByUserId]);

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

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 p-3 dark:border-white/10">
        <div className="space-y-1">
          <label className="text-xs font-medium">Rep</label>
          <select
            value={repFilter}
            onChange={(e) => setRepFilter(e.target.value)}
            className="block rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          >
            <option value="all">All reps</option>
            {repOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Zip</label>
          <select
            value={zipFilter}
            onChange={(e) => setZipFilter(e.target.value)}
            className="block rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          >
            <option value="all">All zips</option>
            {zipOptions.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </div>
        {(repFilter !== "all" || zipFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setRepFilter("all");
              setZipFilter("all");
            }}
            className="rounded border border-black/15 px-3 py-1 text-sm dark:border-white/20"
          >
            Clear filters
          </button>
        )}
      </div>

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
      </div>

      {isVisible("trend") && (
        <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
          <h2 className="text-sm font-medium">Leads created — last 30 days</h2>
          <div className="mt-3">
            <TrendChart data={trend30} />
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {isVisible("disposition") && (
          <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
            <h2 className="text-sm font-medium">Leads by disposition</h2>
            <div className="mt-3">
              <BarChart items={dispositionBreakdown} />
            </div>
          </div>
        )}
        {isVisible("zip") && (
          <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
            <h2 className="text-sm font-medium">Leads by zip</h2>
            <div className="mt-3">
              <BarChart items={zipBreakdown} />
            </div>
          </div>
        )}
        {isVisible("byRep") && showRepBreakdown && (
          <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
            <h2 className="text-sm font-medium">Leads by rep</h2>
            <div className="mt-3">
              <BarChart items={byRepBreakdown} />
            </div>
          </div>
        )}
        {isVisible("doorsKnocked") && showRepBreakdown && (
          <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
            <h2 className="text-sm font-medium">Doors knocked by rep (30 days)</h2>
            <div className="mt-3">
              <BarChart items={doorsKnockedBreakdown} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
