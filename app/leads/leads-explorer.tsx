"use client";

import { useMemo, useState, useTransition } from "react";
import { LeadsMap } from "./leads-map";
import { LeadsList } from "./leads-list";
import { SearchableMultiSelect } from "./searchable-multi-select";
import { LeadDetailPanel } from "./lead-detail-panel";
import { AddLeadModal } from "./add-lead-modal";
import { RouteResultPanel } from "./route-result-panel";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/components/ui/cn";
import type { AppointmentFormField, Disposition, Lead, RouteStop, TeamZip } from "./types";

type ViewMode = "map" | "list";

// Google Directions API allows 25 waypoints total; the rep's current
// location always takes one of those slots as the route origin, so at
// most 24 leads can be selected.
const MAX_ROUTE_STOPS = 24;

function getCurrentLocation(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation isn't supported by this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) =>
        reject(
          new Error(
            err.message || "Couldn't get your location — allow location access and try again."
          )
        ),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

export function LeadsExplorer({
  leads,
  dispositions,
  teamZips,
  appointmentFormFields,
  currentUserId,
  canFilterByRep,
  isAdmin,
  googleMapsApiKey,
}: {
  leads: Lead[];
  dispositions: Disposition[];
  teamZips: TeamZip[];
  appointmentFormFields: AppointmentFormField[];
  currentUserId: string;
  canFilterByRep: boolean;
  isAdmin: boolean;
  googleMapsApiKey: string;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [dispositionFilter, setDispositionFilter] = useState("all");
  const [zipFilter, setZipFilter] = useState<string[]>([]);
  const [repFilter, setRepFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [addressQuery, setAddressQuery] = useState("");
  const [appliedAddressQuery, setAppliedAddressQuery] = useState("");
  const [leadsState, setLeadsState] = useState(leads);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [showAddLead, setShowAddLead] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [routeStops, setRouteStops] = useState<RouteStop[] | null>(null);
  const [routeSkipped, setRouteSkipped] = useState(0);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [isRouting, startRouting] = useTransition();

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

  // Permission-scoped: these are always derived from teamZips (the
  // subordinate_zip_assignments RPC), which itself only ever returns zips
  // the current user is allowed to see — their own for a rep, their
  // subtree's for a team_lead, everyone's for admin/super_admin. Narrows
  // further to the selected rep's zips when one is picked.
  const zipOptions = useMemo(() => {
    const relevant = repFilter === "all" ? teamZips : teamZips.filter((tz) => tz.user_id === repFilter);
    return Array.from(new Set(relevant.map((tz) => tz.zipcode)))
      .sort()
      .map((z) => ({ value: z, label: z }));
  }, [teamZips, repFilter]);

  const selectedRepZips = useMemo(() => {
    if (repFilter === "all") return null;
    return new Set(teamZips.filter((tz) => tz.user_id === repFilter).map((tz) => tz.zipcode));
  }, [teamZips, repFilter]);

  const filteredLeads = useMemo(() => {
    const zipSet = zipFilter.length > 0 ? new Set(zipFilter) : null;
    const addressQueryLower = appliedAddressQuery.trim().toLowerCase();

    return leadsState.filter((lead) => {
      if (dispositionFilter !== "all" && lead.disposition_id !== dispositionFilter) return false;
      if (zipSet && !zipSet.has(lead.zipcode)) return false;
      if (selectedRepZips && !selectedRepZips.has(lead.zipcode)) return false;

      const leadDate = lead.created_at.slice(0, 10);
      if (dateFrom && leadDate < dateFrom) return false;
      if (dateTo && leadDate > dateTo) return false;

      if (addressQueryLower) {
        const haystack = `${lead.address_line} ${lead.city ?? ""}`.toLowerCase();
        if (!haystack.includes(addressQueryLower)) return false;
      }

      return true;
    });
  }, [leadsState, dispositionFilter, zipFilter, selectedRepZips, dateFrom, dateTo, appliedAddressQuery]);

  const withoutLocation = filteredLeads.filter((l) => l.lat == null || l.lng == null).length;

  const selectedLead = selectedLeadId
    ? (leadsState.find((l) => l.id === selectedLeadId) ?? null)
    : null;

  function handleClearFilters() {
    setDispositionFilter("all");
    setZipFilter([]);
    setRepFilter("all");
    setDateFrom("");
    setDateTo("");
    setAddressQuery("");
    setAppliedAddressQuery("");
  }

  function handleTogglePin(leadId: string) {
    setSelectedLeadIds((prev) => {
      if (prev.includes(leadId)) return prev.filter((id) => id !== leadId);
      if (prev.length >= MAX_ROUTE_STOPS) return prev;
      return [...prev, leadId];
    });
  }

  function handleCancelSelect() {
    setSelectMode(false);
    setSelectedLeadIds([]);
    setRouteError(null);
  }

  function handleBuildRoute() {
    setRouteError(null);
    startRouting(async () => {
      let origin;
      try {
        origin = await getCurrentLocation();
      } catch (err) {
        setRouteError(err instanceof Error ? err.message : "Couldn't get your location.");
        return;
      }

      const res = await fetch("/api/leads/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: selectedLeadIds, origin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRouteError(data.error ?? "Failed to build route.");
        return;
      }
      setRouteStops(data.stops);
      setRouteSkipped(data.skippedCount ?? 0);
      setSelectMode(false);
      setSelectedLeadIds([]);
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-black/10 px-6 py-3 dark:border-white/10">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">Disposition</label>
            <Select value={dispositionFilter} onChange={(e) => setDispositionFilter(e.target.value)} className="block">
              <option value="all">All</option>
              {dispositions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>

          {canFilterByRep && (
            <div className="space-y-1">
              <label className="text-xs font-medium">Rep</label>
              <Select
                value={repFilter}
                onChange={(e) => {
                  setRepFilter(e.target.value);
                  setZipFilter([]);
                }}
                className="block"
              >
                <option value="all">All reps</option>
                {repOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id === currentUserId ? `${r.name} (me)` : r.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <SearchableMultiSelect
            label="Zip"
            options={zipOptions}
            selected={zipFilter}
            onChange={setZipFilter}
            emptyMessage="No zips assigned yet"
          />

        <div className="space-y-1">
          <label className="text-xs font-medium">From</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="block" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">To</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="block" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium">Search address</label>
          <div className="flex gap-1">
            <Input
              value={addressQuery}
              onChange={(e) => setAddressQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setAppliedAddressQuery(addressQuery);
                }
              }}
              placeholder="123 Main St"
            />
            <Button type="button" variant="secondary" size="sm" onClick={() => setAppliedAddressQuery(addressQuery)}>
              Search
            </Button>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {selectMode ? (
            <>
              <span className="text-sm">
                {selectedLeadIds.length} selected
                {viewMode === "list" && (
                  <span className="ml-1 text-black/50 dark:text-white/50">
                    (switch to Map to pick pins)
                  </span>
                )}
              </span>
              <Button
                type="button"
                size="sm"
                onClick={handleBuildRoute}
                disabled={selectedLeadIds.length < 1 || isRouting}
              >
                {isRouting ? "Routing…" : "Route"}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={handleCancelSelect}>
                Cancel
              </Button>
              {routeError && (
                <span className="text-sm text-red-600 dark:text-red-400">{routeError}</span>
              )}
            </>
          ) : (
            <>
              <Button type="button" size="sm" onClick={() => setShowAddLead(true)}>
                + Add Lead
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setSelectMode(true)}>
                Select Leads
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={handleClearFilters}>
                Clear filters
              </Button>
            </>
          )}
          <span className="text-sm text-black/60 dark:text-white/60">
            {filteredLeads.length} lead{filteredLeads.length === 1 ? "" : "s"}
            {viewMode === "map" && withoutLocation > 0 && ` (${withoutLocation} without a location)`}
          </span>
          <div className="flex overflow-hidden rounded-full border border-black/15 dark:border-white/20">
            <button
              onClick={() => setViewMode("map")}
              className={cn(
                "px-3 py-1 text-sm font-medium transition-colors",
                viewMode === "map" ? "bg-blue-600 text-white dark:bg-blue-500" : "hover:bg-black/5 dark:hover:bg-white/10"
              )}
            >
              Map
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "px-3 py-1 text-sm font-medium transition-colors",
                viewMode === "list" ? "bg-blue-600 text-white dark:bg-blue-500" : "hover:bg-black/5 dark:hover:bg-white/10"
              )}
            >
              List
            </button>
          </div>
        </div>
      </div>
      {/* Its own line below the whole filter row (not nested inside the
          Rep filter item) so it can't throw off items-end alignment for
          every other filter in that row the way it did when nested
          inside the Rep field's own flex item. */}
      {canFilterByRep && repOptions.length === 0 && (
        <p className="mt-2 text-xs text-black/40 dark:text-white/40">
          No reps have assigned zips yet — assign one in{" "}
          <a href="/admin/reps/manage" className="underline">
            Manage Reps
          </a>{" "}
          to filter by them here.
        </p>
      )}
      </div>

      <div className="flex-1">
        {viewMode === "map" ? (
          <LeadsMap
            leads={filteredLeads}
            dispositionById={dispositionById}
            apiKey={googleMapsApiKey}
            selectMode={selectMode}
            selectedLeadIds={selectedLeadIds}
            onSelectLead={setSelectedLeadId}
            onTogglePin={handleTogglePin}
          />
        ) : (
          <LeadsList
            leads={filteredLeads}
            dispositions={dispositions}
            dispositionById={dispositionById}
            onSelectLead={setSelectedLeadId}
          />
        )}
      </div>

      {selectedLead && (
        <LeadDetailPanel
          key={selectedLead.id}
          lead={selectedLead}
          dispositions={dispositions}
          appointmentFormFields={appointmentFormFields}
          isAdmin={isAdmin}
          onClose={() => setSelectedLeadId(null)}
          onDispositionSaved={(leadId, dispositionId) =>
            setLeadsState((prev) =>
              prev.map((l) => (l.id === leadId ? { ...l, disposition_id: dispositionId } : l))
            )
          }
          onPriorSaleDateSaved={(leadId, priorSaleDate) =>
            setLeadsState((prev) =>
              prev.map((l) => (l.id === leadId ? { ...l, prior_sale_date: priorSaleDate } : l))
            )
          }
          onLeadUpdated={(updatedLead) =>
            setLeadsState((prev) => prev.map((l) => (l.id === updatedLead.id ? updatedLead : l)))
          }
        />
      )}

      {showAddLead && (
        <AddLeadModal
          onClose={() => setShowAddLead(false)}
          onAdded={(lead) => {
            setLeadsState((prev) => [lead, ...prev]);
            setShowAddLead(false);
          }}
        />
      )}

      {routeStops && (
        <RouteResultPanel
          stops={routeStops}
          skippedCount={routeSkipped}
          onClose={() => setRouteStops(null)}
        />
      )}
    </div>
  );
}
