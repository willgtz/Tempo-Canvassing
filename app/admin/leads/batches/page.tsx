import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DeleteBatchButton } from "./delete-batch-button";
import { DeleteLeadButton } from "./delete-lead-button";

type BatchListItem = {
  id: string;
  filename: string | null;
  uploaded_at: string;
  row_count: number;
  profiles: { full_name: string } | null;
};

type ManualLeadItem = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  address_line: string;
  city: string | null;
  state: string | null;
  zipcode: string;
  created_at: string;
  profiles: { full_name: string } | null;
};

export default async function LeadBatchesPage() {
  const supabase = await createClient();
  const [{ data: batches, error }, { data: manualLeads, error: manualLeadsError }] = await Promise.all([
    supabase
      .from("lead_batches")
      .select("id, filename, uploaded_at, row_count, profiles(full_name)")
      .order("uploaded_at", { ascending: false }),
    supabase
      .from("leads")
      .select(
        "id, first_name, last_name, address_line, city, state, zipcode, created_at, profiles!entered_by(full_name)"
      )
      .eq("is_manual", true)
      .order("created_at", { ascending: false }),
  ]);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-4xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load batches: {error.message}
      </div>
    );
  }

  const rows = (batches ?? []) as unknown as BatchListItem[];
  const manualRows = (manualLeads ?? []) as unknown as ManualLeadItem[];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Lead Batches</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Each CSV upload creates one batch. Deleting a batch permanently
          removes its leads for every user — use this to undo an accidental
          upload.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr>
              <th className="px-3 py-2 font-medium">Filename</th>
              <th className="px-3 py-2 font-medium">Uploaded By</th>
              <th className="px-3 py-2 font-medium">Uploaded At</th>
              <th className="px-3 py-2 font-medium">Leads</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((batch) => (
              <tr key={batch.id} className="border-t border-black/5 dark:border-white/10">
                <td className="px-3 py-2">{batch.filename ?? "—"}</td>
                <td className="px-3 py-2">{batch.profiles?.full_name ?? "Unknown"}</td>
                <td className="px-3 py-2">{new Date(batch.uploaded_at).toLocaleString()}</td>
                <td className="px-3 py-2 tabular-nums">{batch.row_count}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/admin/leads/batches/${batch.id}`}
                      className="rounded border border-black/15 px-2 py-1 text-xs dark:border-white/20"
                    >
                      View
                    </Link>
                    <DeleteBatchButton batchId={batch.id} filename={batch.filename} />
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-black/50 dark:text-white/50" colSpan={5}>
                  No batches yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        <div>
          <h2 className="text-lg font-semibold">Manually Entered Leads</h2>
          <p className="text-sm text-black/60 dark:text-white/60">
            Cold-knock leads reps added themselves from the field — not part
            of any batch, so they&apos;re listed here instead.
          </p>
        </div>

        {manualLeadsError ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            Failed to load manual leads: {manualLeadsError.message}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-black/5 dark:bg-white/5">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Address</th>
                  <th className="px-3 py-2 font-medium">Entered By</th>
                  <th className="px-3 py-2 font-medium">Added</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {manualRows.map((lead) => (
                  <tr key={lead.id} className="border-t border-black/5 dark:border-white/10">
                    <td className="px-3 py-2">
                      {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {[lead.address_line, lead.city, lead.state, lead.zipcode]
                        .filter(Boolean)
                        .join(", ")}
                    </td>
                    <td className="px-3 py-2">{lead.profiles?.full_name ?? "Unknown"}</td>
                    <td className="px-3 py-2">{new Date(lead.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      <DeleteLeadButton leadId={lead.id} addressLine={lead.address_line} />
                    </td>
                  </tr>
                ))}
                {manualRows.length === 0 && (
                  <tr>
                    <td className="px-3 py-4 text-black/50 dark:text-white/50" colSpan={5}>
                      No manually entered leads.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
