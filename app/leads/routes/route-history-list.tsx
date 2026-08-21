"use client";

import { useState } from "react";
import Link from "next/link";

type RouteEntry = {
  id: string;
  userId: string;
  leadIds: string[];
  createdAt: string;
};

type LeadInfo = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  address_line: string;
  city: string | null;
  state: string | null;
  zipcode: string;
};

export function RouteHistoryList({
  currentUserId,
  routes,
  leads,
  profiles,
}: {
  currentUserId: string;
  routes: RouteEntry[];
  leads: LeadInfo[];
  profiles: { id: string; full_name: string }[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const nameById = new Map(profiles.map((p) => [p.id, p.full_name]));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Route History</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            {currentUserId ? "Your past built routes." : ""}
          </p>
        </div>
        <Link
          href="/leads"
          className="shrink-0 rounded-full border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Back to Leads
        </Link>
      </div>

      {routes.length === 0 && (
        <p className="text-sm italic text-black/50 dark:text-white/50">
          No routes built yet — routes you build from the Leads map (Select Leads → Route) show
          up here.
        </p>
      )}

      <div className="space-y-2">
        {routes.map((route) => {
          const isExpanded = expandedId === route.id;
          const stopLeads = route.leadIds.map((id) => leadById.get(id)).filter((l): l is LeadInfo => Boolean(l));
          const isOwnRoute = route.userId === currentUserId;
          return (
            <div key={route.id} className="rounded-lg border border-black/10 dark:border-white/10">
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : route.id)}
                className="flex w-full items-center justify-between gap-3 p-3 text-left"
              >
                <div>
                  <p className="text-sm font-medium">
                    {new Date(route.createdAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                  <p className="text-xs text-black/50 dark:text-white/50">
                    {route.leadIds.length} stop{route.leadIds.length === 1 ? "" : "s"}
                    {!isOwnRoute && ` · ${nameById.get(route.userId) ?? "Unknown"}`}
                  </p>
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className={`h-4 w-4 shrink-0 text-black/40 transition-transform dark:text-white/40 ${isExpanded ? "rotate-180" : ""}`}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {isExpanded && (
                <ol className="space-y-2 border-t border-black/10 p-3 pt-3 dark:border-white/10">
                  {stopLeads.length === 0 && (
                    <li className="text-xs italic text-black/40 dark:text-white/40">
                      None of these leads are visible to you anymore.
                    </li>
                  )}
                  {stopLeads.map((lead, i) => (
                    <li key={lead.id} className="flex gap-2 text-sm">
                      <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-black text-[10px] font-medium text-white dark:bg-white dark:text-black">
                        {i + 1}
                      </span>
                      <div>
                        <p className="font-medium">
                          {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Lead"}
                        </p>
                        <p className="text-black/60 dark:text-white/60">
                          {[lead.address_line, lead.city, lead.state, lead.zipcode].filter(Boolean).join(", ")}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
