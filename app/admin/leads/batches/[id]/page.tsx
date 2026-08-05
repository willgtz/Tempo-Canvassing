import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DeleteBatchButton } from "../delete-batch-button";

type BatchDetail = {
  id: string;
  filename: string | null;
  uploaded_at: string;
  row_count: number;
  profiles: { full_name: string } | null;
};

type BatchLead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  address_line: string;
  city: string | null;
  state: string | null;
  zipcode: string;
  lat: number | null;
  geocode_precision: string | null;
  geocoded_at: string | null;
};

function geocodeStatus(lead: BatchLead): string {
  if (!lead.geocoded_at) return "Pending";
  if (lead.lat == null) return "Failed";
  return lead.geocode_precision === "ROOFTOP" ? "Rooftop" : "Approximate";
}

export default async function BatchDetailPage(props: PageProps<"/admin/leads/batches/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const [{ data: batch, error: batchError }, { data: leads, error: leadsError }] = await Promise.all([
    supabase
      .from("lead_batches")
      .select("id, filename, uploaded_at, row_count, profiles(full_name)")
      .eq("id", id)
      .single(),
    supabase
      .from("leads")
      .select(
        "id, first_name, last_name, address_line, city, state, zipcode, lat, geocode_precision, geocoded_at"
      )
      .eq("batch_id", id)
      .order("created_at"),
  ]);

  if (batchError || !batch) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6 text-sm text-red-600 dark:text-red-400">
        Batch not found.
      </div>
    );
  }

  const batchRow = batch as unknown as BatchDetail;
  const rows = (leads ?? []) as unknown as BatchLead[];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <Link href="/admin/leads/batches" className="text-sm hover:underline">
        &larr; Lead Batches
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{batchRow.filename ?? "Untitled batch"}</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            Uploaded {new Date(batchRow.uploaded_at).toLocaleString()} by{" "}
            {batchRow.profiles?.full_name ?? "Unknown"} — {batchRow.row_count} leads
          </p>
        </div>
        <DeleteBatchButton
          batchId={batchRow.id}
          filename={batchRow.filename}
          redirectTo="/admin/leads/batches"
        />
      </div>

      {leadsError && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to load leads: {leadsError.message}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Address</th>
              <th className="px-3 py-2 font-medium">Zip</th>
              <th className="px-3 py-2 font-medium">Geocode</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((lead) => (
              <tr key={lead.id} className="border-t border-black/5 dark:border-white/10">
                <td className="px-3 py-2">
                  {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—"}
                </td>
                <td className="px-3 py-2">
                  {[lead.address_line, lead.city, lead.state].filter(Boolean).join(", ")}
                </td>
                <td className="px-3 py-2">{lead.zipcode}</td>
                <td className="px-3 py-2">{geocodeStatus(lead)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-black/50 dark:text-white/50" colSpan={4}>
                  No leads in this batch.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
