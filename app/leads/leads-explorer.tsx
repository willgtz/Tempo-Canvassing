"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LeadsMap } from "./leads-map";
import { LeadsList } from "./leads-list";
import { SearchableMultiSelect } from "./searchable-multi-select";
import { LeadDetailPanel } from "./lead-detail-panel";
import { AddLeadModal } from "./add-lead-modal";
import { RouteResultPanel } from "./route-result-panel";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/components/ui/cn";
import { MobileTabBarSpacer } from "@/components/mobile-tab-bar";
import { getCurrentLocation } from "@/lib/geo";
import { usePersistedLeadsFilters } from "./use-persisted-leads-filters";
import type { AppointmentFormField, Disposition, Lead, Profile, RouteStop } from "./types";

type ViewMode = "map" | "list";

// Google Directions API allows 25 waypoints total; the rep's current
// location always takes one of those slots as the route origin, so at
// most 24 leads can be selected.
const MAX_ROUTE_STOPS = 24;

export function LeadsExplorer({
  leads,
  dispositions,
  profiles,
  appointmentFormFields,
  currentUserId,
  canFilterByRep,
  isAdmin,
  canArchive,
  mapboxAccessToken,
  doorKnockRadiusFeet,
}: {
  leads: Lead[];
  dispositions: Disposition[];
  profiles: Profile[];
  appointmentFormFields: AppointmentFormField[];
  currentUserId: string;
  canFilterByRep: boolean;
  isAdmin: boolean;
  canArchive: boolean;
  mapboxAccessToken: string;
  doorKnockRadiusFeet: number;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  // Empty set means "show all" — same convention the Appointments status
  // filter already uses. Multi-select (not a single dropdown value) so a
  // rep can filter to e.g. "Not Home" + "Callback" at once.
  const [dispositionFilter, setDispositionFilter] = useState<Set<string>>(new Set());
  const [zipFilter, setZipFilter] = useState<string[]>([]);
  const [repFilter, setRepFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [updatedFrom, setUpdatedFrom] = useState("");
  const [updatedTo, setUpdatedTo] = useState("");
  const [addressQuery, setAddressQuery] = useState("");
  const [appliedAddressQuery, setAppliedAddressQuery] = useState("");
  const [leadsState, setLeadsState] = useState(leads);
  // Deep-link support for "Go to Lead" (appointment detail panels) —
  // /leads?lead=<id> opens straight to that lead's detail panel and
  // (in map view) flies the map to it, instead of landing on the
  // unfocused default view.
  const searchParams = useSearchParams();
  const focusLeadId = searchParams.get("lead");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(focusLeadId);
  const [showAddLead, setShowAddLead] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [routeStops, setRouteStops] = useState<RouteStop[] | null>(null);
  const [routeSkipped, setRouteSkipped] = useState(0);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [isRouting, startRouting] = useTransition();
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  // Filters (and view mode) survive a refresh/reopen — restored once on
  // mount below, written back on every subsequent change. Scoped to
  // this browser/device, not shared data, so localStorage (via the
  // usePersistedLeadsFilters hook) is the right store, same reasoning
  // as useWidgetVisibility.
  const { restored: restoredFilters, save: savePersistedFilters } = usePersistedLeadsFilters();
  const hasHydratedFilters = useRef(false);

  useEffect(() => {
    if (!restoredFilters || hasHydratedFilters.current) return;
    hasHydratedFilters.current = true;
    // Deep-link (?lead=) selection already seeded viewMode/etc from props
    // at mount — restoring here can still safely override viewMode itself
    // (which tab was open), just not selectedLeadId (left untouched).
    setDispositionFilter(new Set(restoredFilters.dispositionFilter));
    setZipFilter(restoredFilters.zipFilter);
    setRepFilter(restoredFilters.repFilter);
    setDateFrom(restoredFilters.dateFrom);
    setDateTo(restoredFilters.dateTo);
    setUpdatedFrom(restoredFilters.updatedFrom);
    setUpdatedTo(restoredFilters.updatedTo);
    setAppliedAddressQuery(restoredFilters.appliedAddressQuery);
    setAddressQuery(restoredFilters.appliedAddressQuery);
    setViewMode(restoredFilters.viewMode);
  }, [restoredFilters]);

  useEffect(() => {
    savePersistedFilters({
      dispositionFilter: Array.from(dispositionFilter),
      zipFilter,
      repFilter,
      dateFrom,
      dateTo,
      updatedFrom,
      updatedTo,
      appliedAddressQuery,
      viewMode,
    });
  }, [
    dispositionFilter,
    zipFilter,
    repFilter,
    dateFrom,
    dateTo,
    updatedFrom,
    updatedTo,
    appliedAddressQuery,
    viewMode,
    savePersistedFilters,
  ]);

  const dispositionById = useMemo(
    () => new Map(dispositions.map((d) => [d.id, d])),
    [dispositions]
  );

  // Every active profile, not just reps who hold a direct zip
  // assignment — a rep can now also see leads purely through team-based
  // sharing, so they need to be selectable here too, in order to preview
  // what they can see at all.
  const repOptions = useMemo(() => {
    return profiles
      .filter((p) => p.active)
      .map((p) => ({ id: p.id, name: p.full_name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [profiles]);

  // Every zipcode actually present among the currently-loaded leads —
  // for this viewer (a team_lead/admin, per canFilterByRep), leads is
  // already everything leads_select lets them see, so this naturally
  // includes zips with no direct assignment. Narrowed to the selected
  // rep's effective zips below once that fetch resolves.
  const zipOptions = useMemo(() => {
    return Array.from(new Set(leads.map((l) => l.zipcode)))
      .sort()
      .map((z) => ({ value: z, label: z }));
  }, [leads]);

  // The selected rep's TRUE effective visibility — their own zip
  // assignments plus their manager-hierarchy subtree plus (since Teams)
  // their teammates' zips, computed live via visible_zipcodes/
  // teammate_ids.
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

  // Zip dropdown options narrow to the selected rep's effective zips.
  const zipOptionsForRep = useMemo(() => {
    if (repFilter === "all" || !effectiveRepZips) return zipOptions;
    return zipOptions.filter((o) => effectiveRepZips.has(o.value));
  }, [zipOptions, repFilter, effectiveRepZips]);

  const filteredLeads = useMemo(() => {
    const zipSet = zipFilter.length > 0 ? new Set(zipFilter) : null;
    const addressQueryLower = appliedAddressQuery.trim().toLowerCase();

    return leadsState.filter((lead) => {
      if (dispositionFilter.size > 0 && !dispositionFilter.has(lead.disposition_id ?? "")) return false;
      if (zipSet && !zipSet.has(lead.zipcode)) return false;

      // Mirrors leads_select's real logic (zip visibility OR own/teammate
      // manual entry) minus its appointment-assignment clause — a lead
      // visible to this rep ONLY because they're assigned to an
      // appointment on it won't show up here. Accepted simplification
      // for a "what can they broadly see" preview.
      if (repFilter !== "all" && effectiveRepZips) {
        const isManualCarveOut =
          lead.is_manual &&
          (lead.entered_by === repFilter ||
            (lead.entered_by != null && effectiveRepTeammates?.has(lead.entered_by)) === true);
        if (!effectiveRepZips.has(lead.zipcode) && !isManualCarveOut) return false;
      }

      const leadDate = lead.created_at.slice(0, 10);
      if (dateFrom && leadDate < dateFrom) return false;
      if (dateTo && leadDate > dateTo) return false;

      const leadUpdatedDate = lead.updated_at.slice(0, 10);
      if (updatedFrom && leadUpdatedDate < updatedFrom) return false;
      if (updatedTo && leadUpdatedDate > updatedTo) return false;

      if (addressQueryLower) {
        const haystack = `${lead.address_line} ${lead.city ?? ""}`.toLowerCase();
        if (!haystack.includes(addressQueryLower)) return false;
      }

      return true;
    });
  }, [
    leadsState,
    dispositionFilter,
    zipFilter,
    repFilter,
    effectiveRepZips,
    effectiveRepTeammates,
    dateFrom,
    dateTo,
    updatedFrom,
    updatedTo,
    appliedAddressQuery,
  ]);

  const withoutLocation = filteredLeads.filter((l) => l.lat == null || l.lng == null).length;

  const activeFilterCount =
    (dispositionFilter.size > 0 ? 1 : 0) +
    (repFilter !== "all" ? 1 : 0) +
    (zipFilter.length > 0 ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (updatedFrom ? 1 : 0) +
    (updatedTo ? 1 : 0);

  const selectedLead = selectedLeadId
    ? (leadsState.find((l) => l.id === selectedLeadId) ?? null)
    : null;

  function handleClearFilters() {
    setDispositionFilter(new Set());
    setZipFilter([]);
    setRepFilter("all");
    setDateFrom("");
    setDateTo("");
    setUpdatedFrom("");
    setUpdatedTo("");
    setAddressQuery("");
    setAppliedAddressQuery("");
  }

  function toggleDisposition(dispositionId: string) {
    setDispositionFilter((prev) => {
      const next = new Set(prev);
      if (next.has(dispositionId)) next.delete(dispositionId);
      else next.add(dispositionId);
      return next;
    });
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
      setRouteId(data.routeId ?? null);
      setSelectMode(false);
      setSelectedLeadIds([]);
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Mobile: one slim row (search + filter + add + view toggle, or the
          select-mode controls), a fraction of the desktop filter bar's
          height — the map is the main feature on a phone and needed most
          of the vertical space back, matching how the native app puts
          search/filter in a small floating capsule rather than a full
          inline form. Full filter set (Disposition/Rep/Zip/dates) moved
          into a bottom sheet opened via the filter icon, not removed. */}
      <div className="flex items-center justify-end gap-2 border-b border-black/10 px-3 py-2 md:hidden dark:border-white/10">
        {selectMode ? (
          <>
            <span className="flex-1 text-sm">
              {selectedLeadIds.length} selected
              {viewMode === "list" && (
                <span className="block text-xs text-black/50 dark:text-white/50">Switch to Map to pick pins</span>
              )}
            </span>
            <Button type="button" size="sm" onClick={handleBuildRoute} disabled={selectedLeadIds.length < 1 || isRouting}>
              {isRouting ? "Routing…" : "Route"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={handleCancelSelect}>
              Cancel
            </Button>
          </>
        ) : showMobileSearch ? (
          <>
            <Input
              autoFocus
              value={addressQuery}
              onChange={(e) => setAddressQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setAppliedAddressQuery(addressQuery);
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setShowMobileSearch(false);
                }
              }}
              placeholder="Search address"
              className="min-w-0 flex-1 rounded-full"
            />
            <button
              onClick={() => {
                setShowMobileSearch(false);
                setAddressQuery("");
                setAppliedAddressQuery("");
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
            {/* Collapsed to an icon by default — a full-width search
                input was eating almost as much of the compact bar as
                the old desktop filter block did, working against the
                whole point of this row (max space for the map). Expands
                in place when tapped instead of always being open. */}
            <button
              onClick={() => setShowMobileSearch(true)}
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/15 active:bg-black/10 dark:border-white/20 dark:active:bg-white/20"
              aria-label="Search address"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4.5 w-4.5">
                <circle cx="11" cy="11" r="7" />
                <path strokeLinecap="round" d="M21 21l-4.3-4.3" />
              </svg>
              {appliedAddressQuery && (
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
            <button
              onClick={() => setShowAddLead(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/15 active:bg-black/10 dark:border-white/20 dark:active:bg-white/20"
              aria-label="Add lead"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4.5 w-4.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
              </svg>
            </button>
            {/* Route-building was only reachable buried inside the
                filter sheet — pulled it out to its own icon here since
                it's a primary map action, not a filter. Map-only: select
                mode picks pins on the map, nothing to select in List. */}
            {viewMode === "map" && (
              <button
                onClick={() => setSelectMode(true)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/15 active:bg-black/10 dark:border-white/20 dark:active:bg-white/20"
                aria-label="Select leads for route"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4.5 w-4.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 19c3-6 5-3 7-8s3-6 9-6" strokeDasharray="2.5 2.5" />
                  <circle cx="4" cy="19" r="1.6" fill="currentColor" stroke="none" />
                  <circle cx="20" cy="5" r="1.6" fill="currentColor" stroke="none" />
                </svg>
              </button>
            )}
            <div className="flex shrink-0 overflow-hidden rounded-full border border-black/15 dark:border-white/20">
              <button
                onClick={() => setViewMode("map")}
                className={cn("flex h-9 w-9 items-center justify-center", viewMode === "map" ? "bg-blue-600 text-white dark:bg-blue-500" : "")}
                aria-label="Map view"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4.5 w-4.5">
                  <path d="M9 20 3 17.5V6L9 8.5m0 11.5 6-2.5m-6 2.5V8.5m6 9 6 2.5V8.5L15 6m0 11.5V6m0 0L9 8.5" />
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
              <label className="text-xs font-medium">Disposition</label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setDispositionFilter(new Set())}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    dispositionFilter.size === 0
                      ? "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500"
                      : "border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                  )}
                >
                  All
                </button>
                {/* Toggles the "" key — filteredLeads already keys off
                    lead.disposition_id ?? "", so this needs no separate
                    filter logic, just a way to select it. */}
                <button
                  onClick={() => toggleDisposition("")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    dispositionFilter.has("")
                      ? "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500"
                      : "border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                  )}
                >
                  <span className="inline-block h-2 w-2 rounded-full border border-black/20 dark:border-white/30" />
                  No disposition
                </button>
                {dispositions.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => toggleDisposition(d.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      dispositionFilter.has(d.id)
                        ? "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500"
                        : "border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                    )}
                  >
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                    {d.name}
                  </button>
                ))}
              </div>
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
                  className="block w-full"
                >
                  <option value="all">All reps</option>
                  {repOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.id === currentUserId ? `${r.name} (me)` : r.name}
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
            )}

            <SearchableMultiSelect
              label="Zip"
              options={zipOptionsForRep}
              selected={zipFilter}
              onChange={setZipFilter}
              emptyMessage="No zips assigned yet"
            />

            {/* Stacked below sm (real phones), side-by-side from sm up —
                native date inputs render very differently across mobile
                browsers (some render a full localized date string, not
                just mm/dd/yyyy) and can't be reliably sized down to fit
                half a narrow phone screen, so this doesn't rely on
                squeezing two into one row on the narrowest viewports at
                all. min-w-0 kept for the sm:grid-cols-2 case, where CSS
                Grid's default min-width:auto could otherwise still let
                a wide date input overflow its track. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-1">
                <label className="text-xs font-medium">Created from</label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="block w-full" />
              </div>
              <div className="min-w-0 space-y-1">
                <label className="text-xs font-medium">Created to</label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="block w-full" />
              </div>
              <div className="min-w-0 space-y-1">
                <label className="text-xs font-medium">Updated from</label>
                <Input type="date" value={updatedFrom} onChange={(e) => setUpdatedFrom(e.target.value)} className="block w-full" />
              </div>
              <div className="min-w-0 space-y-1">
                <label className="text-xs font-medium">Updated to</label>
                <Input type="date" value={updatedTo} onChange={(e) => setUpdatedTo(e.target.value)} className="block w-full" />
              </div>
            </div>

            <div className="flex gap-2 border-t border-black/10 pt-4 dark:border-white/10">
              <Link
                href="/leads/routes"
                className="flex flex-1 items-center justify-center rounded-full border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              >
                Route History
              </Link>
              <Button type="button" variant="secondary" onClick={handleClearFilters} className="flex-1">
                Clear Filters
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Disposition gets its own full-width row, separate from the rest
          of the filter fields below — with many dispositions configured,
          its pill group can grow wide enough to crowd out Rep/Zip/Date/
          Search on the same flex-wrap row and push them around
          unpredictably. Isolating it keeps the second row's wrapping
          consistent regardless of how many dispositions exist. */}
      <div className="hidden border-b border-black/10 px-6 pt-3 md:block dark:border-white/10">
        <div className="space-y-1">
          <label className="text-xs font-medium">Disposition</label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setDispositionFilter(new Set())}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                dispositionFilter.size === 0
                  ? "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500"
                  : "border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              )}
            >
              All
            </button>
            <button
              onClick={() => toggleDisposition("")}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                dispositionFilter.has("")
                  ? "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500"
                  : "border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              )}
            >
              <span className="inline-block h-2 w-2 rounded-full border border-black/20 dark:border-white/30" />
              No disposition
            </button>
            {dispositions.map((d) => (
              <button
                key={d.id}
                onClick={() => toggleDisposition(d.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  dispositionFilter.has(d.id)
                    ? "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500"
                    : "border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                )}
              >
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                {d.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="hidden border-b border-black/10 px-6 py-3 md:block dark:border-white/10">
        <div className="flex flex-wrap items-end gap-3">
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
              {loadingRepPreview && (
                <p className="text-xs text-black/50 dark:text-white/50">Loading…</p>
              )}
              {repPreviewError && (
                <p className="text-xs text-red-600 dark:text-red-400">{repPreviewError}</p>
              )}
            </div>
          )}

          <SearchableMultiSelect
            label="Zip"
            options={zipOptionsForRep}
            selected={zipFilter}
            onChange={setZipFilter}
            emptyMessage="No zips assigned yet"
          />

        <div className="space-y-1">
          <label className="text-xs font-medium">Created from</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="block" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Created to</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="block" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Updated from</label>
          <Input type="date" value={updatedFrom} onChange={(e) => setUpdatedFrom(e.target.value)} className="block" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Updated to</label>
          <Input type="date" value={updatedTo} onChange={(e) => setUpdatedTo(e.target.value)} className="block" />
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

      {/* relative + LeadsMap's absolute-inset-0 wrapper is deliberate, not
          h-full/w-full — a plain block div's height:100% doesn't reliably
          resolve against a flex-1 ancestor's flex-computed height (it's
          "definite" for flex layout purposes but not for percentage
          resolution on non-flex descendants), which was silently
          collapsing the map's real container to 0 height. Absolute
          positioning sizes directly off this containing block regardless
          of that quirk. */}
      <div className="relative flex-1">
        {viewMode === "map" ? (
          <LeadsMap
            leads={filteredLeads}
            dispositionById={dispositionById}
            apiKey={mapboxAccessToken}
            selectMode={selectMode}
            selectedLeadIds={selectedLeadIds}
            onSelectLead={setSelectedLeadId}
            onTogglePin={handleTogglePin}
            focusLeadId={focusLeadId}
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

      {/* Only in List mode — Map mode deliberately has no spacer (the map
          bleeds edge-to-edge under the fixed tab bar on purpose), but
          List is a normal scrolling flow and its last card was getting
          hidden behind the tab bar with nothing reserving space for it. */}
      {viewMode === "list" && <MobileTabBarSpacer />}

      {selectedLead && (
        <LeadDetailPanel
          key={selectedLead.id}
          lead={selectedLead}
          dispositions={dispositions}
          appointmentFormFields={appointmentFormFields}
          isAdmin={isAdmin}
          canArchive={canArchive}
          doorKnockRadiusFeet={doorKnockRadiusFeet}
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
          onArchived={(leadId) => {
            setLeadsState((prev) => prev.filter((l) => l.id !== leadId));
            setSelectedLeadId(null);
          }}
        />
      )}

      {showAddLead && (
        <AddLeadModal
          dispositions={dispositions}
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
          routeId={routeId}
          onClose={() => {
            setRouteStops(null);
            setRouteId(null);
          }}
          onSelectLead={setSelectedLeadId}
        />
      )}
    </div>
  );
}
