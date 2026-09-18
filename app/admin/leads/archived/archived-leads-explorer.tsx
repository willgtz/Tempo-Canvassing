"use client";

import { useState, useTransition } from "react";
import { unarchiveLead } from "./actions";
import type { ArchivedLead } from "./types";

export function ArchivedLeadsExplorer({ leads }: { leads: ArchivedLead[] }) {
  const [leadsState, setLeadsState] = useState(leads);
  const [unarchivingId, setUnarchivingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUnarchiving, startUnarchiving] = useTransition();

  function handleUnarchive(leadId: string) {
    setError(null);
    setUnarchivingId(leadId);
    startUnarchiving(async () => {
      const result = await unarchiveLead(leadId);
      if (!result.ok) {
        setError(result.error);
        setUnarchivingId(null);
        return;
      }
      setLeadsState((prev) => prev.filter((l) => l.id !== leadId));
      setUnarchivingId(null);
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Archived Leads</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Archived by a team_lead or admin to clean up the map/list without losing data —
          unarchiving here restores a lead to normal visibility for whoever could see it before.
        </p>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">Unarchive failed: {error}</p>}

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Address</th>
              <th className="px-3 py-2 font-medium">Zip</th>
              <th className="px-3 py-2 font-medium">Archived</th>
              <th className="px-3 py-2 font-medium">Archived By</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {leadsState.map((lead) => (
              <tr key={lead.id} className="border-t border-black/5 dark:border-white/10">
                <td className="px-3 py-2">
                  {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—"}
                </td>
                <td className="px-3 py-2">{lead.address_line}</td>
                <td className="px-3 py-2">{lead.zipcode}</td>
                <td className="px-3 py-2">{new Date(lead.archived_at).toLocaleDateString()}</td>
                <td className="px-3 py-2">{lead.archived_by_name ?? "Unknown"}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleUnarchive(lead.id)}
                      disabled={isUnarchiving && unarchivingId === lead.id}
                      className="rounded border border-black/15 px-2 py-1 text-xs disabled:opacity-50 dark:border-white/20"
                    >
                      {isUnarchiving && unarchivingId === lead.id ? "Unarchiving…" : "Unarchive"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {leadsState.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-black/50 dark:text-white/50" colSpan={6}>
                  No archived leads.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
