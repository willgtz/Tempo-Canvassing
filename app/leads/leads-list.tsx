import type { Disposition, Lead } from "./types";

const DEFAULT_COLOR = "#6B7280";

export function LeadsList({
  leads,
  dispositionById,
  onSelectLead,
}: {
  leads: Lead[];
  dispositionById: Map<string, Disposition>;
  onSelectLead: (leadId: string) => void;
}) {
  if (leads.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-black/60 dark:text-white/60">
        No leads match these filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto p-6">
      <table className="w-full min-w-[720px] text-left text-sm">
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
          {leads.map((lead) => {
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
                    <span className="ml-2 rounded-full border border-black/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-black/60 dark:border-white/30 dark:text-white/60">
                      Manual
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {lead.address_line}
                  {lead.lat == null && (
                    <span className="ml-2 text-xs text-black/40 dark:text-white/40">
                      (no location)
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">{lead.zipcode}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-3 w-3 rounded-full border border-black/10 dark:border-white/20"
                      style={{ backgroundColor: disposition?.color ?? DEFAULT_COLOR }}
                    />
                    {disposition?.name ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-2">{new Date(lead.created_at).toLocaleDateString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
