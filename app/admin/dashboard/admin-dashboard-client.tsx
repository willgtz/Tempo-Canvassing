"use client";

import { useEffect, useMemo, useState } from "react";
import { StatTile } from "@/components/dashboard/stat-tile";
import { BarChart } from "@/components/dashboard/bar-chart";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { DoorKnockGoalsTable } from "@/components/dashboard/door-knock-goals-table";
import { WidgetCustomizeMenu } from "@/components/dashboard/widget-customize-menu";
import { useWidgetVisibility } from "@/components/dashboard/use-widget-visibility";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import {
  countInLastDays,
  countByDisposition,
  countByZip,
  countWithoutLocation,
  countManual,
  dailyCounts,
  countByRepViaZips,
  type StatLead,
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
  { id: "doorsKnockedToday", label: "Doors knocked by rep (today)" },
  { id: "doorsKnocked", label: "Doors knocked by rep (30 days)" },
  { id: "doorKnockGoals", label: "Door-knock goals by rep" },
  { id: "zip", label: "Leads by zip" },
];

export function AdminDashboardClient({
  leads,
  doorKnockCounts,
  doorKnockCountsToday,
  dispositions,
  profiles,
  teamZips,
  doorKnockGoals,
  today,
}: {
  leads: StatLead[];
  doorKnockCounts: DoorKnockCount[];
  doorKnockCountsToday: DoorKnockCount[];
  dispositions: Disposition[];
  profiles: Profile[];
  teamZips: TeamZip[];
  doorKnockGoals: GoalRow[];
  today: string;
}) {
  const [repFilter, setRepFilter] = useState("all");
  const [zipFilter, setZipFilter] = useState("all");
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

  // door_knock_counts has no per-lead/zip breakdown (it's a dedup'd count,
  // not raw rows) — only the rep filter applies here, not the zip one.
  // Already scoped to whoever this admin can see (everyone, since
  // is_admin() bypasses can_view_door_knock_count) and already sorted by
  // verified_count desc.
  const doorsKnockedBreakdown = useMemo(() => {
    const rows =
      repFilter === "all" ? doorKnockCounts : doorKnockCounts.filter((r) => r.user_id === repFilter);
    return rows
      .map((r) => ({ label: r.full_name, value: r.verified_count }))
      .sort((a, b) => b.value - a.value);
  }, [doorKnockCounts, repFilter]);

  const doorsKnockedTodayBreakdown = useMemo(() => {
    const rows =
      repFilter === "all"
        ? doorKnockCountsToday
        : doorKnockCountsToday.filter((r) => r.user_id === repFilter);
    return rows
      .map((r) => ({ label: r.full_name, value: r.verified_count }))
      .sort((a, b) => b.value - a.value);
  }, [doorKnockCountsToday, repFilter]);

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
      </div>

      {isVisible("trend") && (
        <Card className="p-4">
          <h2 className="text-sm font-medium">Leads created — last 30 days</h2>
          <div className="mt-3">
            <TrendChart data={trend30} />
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
        {isVisible("doorsKnockedToday") && showRepBreakdown && (
          <Card className="p-4">
            <h2 className="text-sm font-medium">Doors knocked by rep (today)</h2>
            <div className="mt-3">
              <BarChart items={doorsKnockedTodayBreakdown} />
            </div>
          </Card>
        )}
        {isVisible("doorsKnocked") && showRepBreakdown && (
          <Card className="p-4">
            <h2 className="text-sm font-medium">Doors knocked by rep (30 days)</h2>
            <div className="mt-3">
              <BarChart items={doorsKnockedBreakdown} />
            </div>
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
    </div>
  );
}
